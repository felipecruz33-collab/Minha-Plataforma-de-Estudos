import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { AulaImportPayload } from '../types'
import { dividirTextoEmPartes } from './dividirTexto'
import { mesclarAulasDoMesmoPdf } from './mesclarAulas'
import { isSupabaseConfigured, supabase } from '../supabaseClient'

/** Token da sessão atual, ou null no modo local (sem Supabase). */
async function tokenDaSessao(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * Fontes que a apostila usa para dizer "isto é importante".
 *
 * O nome real da fonte ("Helvetica-Bold", "Arial-BoldMT") só aparece depois
 * que a página carrega os objetos dela — daí o `getOperatorList()` antes de
 * pedir o texto. Medido num PDF de 60 páginas: 285 ms sem isso, 374 ms com.
 * São 89 ms a mais numa etapa que a IA depois faz esperar dezenas de segundos.
 */
const FONTE_NEGRITO = /bold|black|heavy|semibold|demibold/i

/**
 * A partir de quanto um texto maior que o corpo vira título.
 *
 * 1,25 porque abaixo disso a diferença costuma ser variação da própria fonte
 * (uma linha com um símbolo mais alto, por exemplo), e marcar título demais é
 * pior do que não marcar nenhum: perde-se justamente a informação de hierarquia
 * que a marcação existe para dar.
 */
const FATOR_TITULO = 1.25

/**
 * Se mais que isto da página está em negrito, o negrito não significa nada.
 *
 * Apostilas inteiras compostas em fonte seminegrito existem. Nelas, marcar tudo
 * entregaria à IA um sinal constante — que é o mesmo que sinal nenhum, só que
 * gastando tokens.
 */
const LIMITE_NEGRITO_INUTIL = 0.4

interface TrechoPdf {
  texto: string
  negrito: boolean
  titulo: boolean
}

/** O tamanho de fonte mais frequente da página — o corpo do texto. */
function tamanhoDoCorpo(alturas: number[]): number {
  const contagem = new Map<number, number>()
  for (const a of alturas) {
    const chave = Math.round(a * 2) / 2
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  let corpo = 0
  let maior = 0
  for (const [altura, vezes] of contagem) {
    if (vezes > maior) {
      maior = vezes
      corpo = altura
    }
  }
  return corpo
}

/**
 * Monta o texto da página marcando o que a apostila destacou.
 *
 * Trechos vizinhos com o mesmo destaque viram um marcador só: sem isso, texto
 * com espaçamento entre letras sairia como `**A** **T** **E**`, que é ruído
 * puro e ainda custa tokens.
 */
function montarTextoDaPagina(trechos: TrechoPdf[]): string {
  const partes: string[] = []
  let i = 0
  while (i < trechos.length) {
    const atual = trechos[i]
    let junto = atual.texto
    let j = i + 1
    while (j < trechos.length && trechos[j].negrito === atual.negrito && trechos[j].titulo === atual.titulo) {
      junto += ' ' + trechos[j].texto
      j++
    }
    junto = junto.trim()
    if (junto) {
      if (atual.titulo) partes.push(`\n## ${junto}\n`)
      else if (atual.negrito) partes.push(`**${junto}**`)
      else partes.push(junto)
    }
    i = j
  }
  return partes.join(' ')
}

async function abrirPdf(file: File) {
  const buffer = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data: buffer }).promise
}

async function extractText(pdf: any): Promise<string[]> {
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)

    // Carrega as fontes da página. Se falhar, seguimos sem saber o que é
    // negrito — o texto continua saindo inteiro, que é o que importa.
    let sabeAsFontes = true
    try {
      await page.getOperatorList()
    } catch {
      sabeAsFontes = false
    }

    const content = await page.getTextContent()
    // `pdf` é `any` (o tipo do pdf.js não viaja bem por aqui), então os itens
    // precisam do formato declarado à mão. Só usamos estes quatro campos.
    type ItemDeTexto = { str: string; height?: number; fontName?: string }
    const itens: ItemDeTexto[] = (content.items as unknown[]).filter(
      (item): item is ItemDeTexto => typeof (item as ItemDeTexto).str === 'string',
    )

    const corpo = tamanhoDoCorpo(itens.filter((it) => it.str.trim()).map((it) => it.height ?? 0))

    const trechos: TrechoPdf[] = itens.map((item) => {
      const altura = item.height ?? 0
      let negrito = false
      if (sabeAsFontes) {
        try {
          const fonte = page.commonObjs.get(item.fontName)
          negrito = FONTE_NEGRITO.test(fonte?.name ?? '')
        } catch {
          negrito = false
        }
      }
      const titulo = corpo > 0 && altura >= corpo * FATOR_TITULO
      return { texto: item.str, negrito: negrito && !titulo, titulo }
    })

    const comTexto = trechos.filter((t) => t.texto.trim())
    const proporcaoNegrito = comTexto.length ? comTexto.filter((t) => t.negrito).length / comTexto.length : 0
    if (proporcaoNegrito > LIMITE_NEGRITO_INUTIL) {
      for (const t of trechos) t.negrito = false
    }

    pages.push(montarTextoDaPagina(trechos))
  }

  return pages
}

/**
 * Junta os pedaços de texto que o pdf.js devolve com um espaço entre cada um.
 * Como esses pedaços seguem a posição dos caracteres na página (colunas,
 * tabulação, alinhamento justificado), isso produz sequências enormes de
 * espaços: no PDF de 73 páginas que usei pra medir, 4.114 trechos com dois ou
 * mais espaços seguidos.
 *
 * Para a IA, cada corrida dessas custa tokens sem carregar nenhuma informação
 * — o layout da página não significa nada depois que o texto foi extraído.
 * Colapsar cada corrida num único espaço economizou 5,5% do texto (~1.637
 * tokens no PDF inteiro), o que se traduz direto em menos tempo de leitura e
 * mais margem dentro do limite de contexto dos modelos gratuitos.
 *
 * De propósito, o corte é conservador: só espaços e tabs horizontais viram um
 * espaço, e as quebras de linha entre páginas continuam intactas. Nada de
 * tentar remendar palavras que o pdf.js partiu ("planejam ento") — juntar
 * pedaços por conta própria arriscaria grudar palavras que deviam ficar
 * separadas, e a IA lida bem com esse tipo de ruído.
 */
export function limparEspacos(texto: string): string {
  return texto
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

/** Extrai o texto do PDF inteiro (todas as páginas, separadas por linha em branco) e a contagem de páginas. */
export async function extrairTextoPdf(file: File): Promise<{ texto: string; numPaginas: number }> {
  const paginas = await extractText(await abrirPdf(file))
  const texto = paginas
    .map(limparEspacos)
    .filter(Boolean)
    .join('\n\n')
  return { texto, numPaginas: paginas.length }
}

/**
 * Resolução em que a página é desenhada para virar imagem.
 *
 * 1,6 põe uma A4 em cerca de 950x1350 — o bastante para a IA ler nota de
 * rodapé e índice de fórmula. Medindo uma página de matemática com gráfico e
 * tabela: 83 kB em WebP nessa faixa, contra 183 kB no dobro da resolução.
 * Acima disso o arquivo cresce muito mais rápido do que a legibilidade.
 */
const ESCALA_IMAGEM = 1.6

/**
 * WebP a 70%, e não JPEG.
 *
 * Medido na mesma página: WebP sai ~30% menor que o JPEG equivalente, e o
 * Gemini aceita os dois. Como o limite do pedido é de tamanho, 30% é uma
 * página a mais por chamada.
 */
const QUALIDADE_IMAGEM = 0.7

/** Desenha uma página do PDF e devolve a imagem como texto (data URL). */
async function renderizarPagina(pdf: any, numero: number): Promise<string> {
  const page = await pdf.getPage(numero)
  const viewport = page.getViewport({ scale: ESCALA_IMAGEM })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('Não foi possível desenhar a página do PDF neste navegador.')
  await page.render({ canvasContext: contexto, viewport }).promise
  const url = canvas.toDataURL('image/webp', QUALIDADE_IMAGEM)
  // Libera a memória do canvas na hora: num PDF de dezenas de páginas, deixar
  // isso para o coletor de lixo derruba o navegador do celular.
  canvas.width = 0
  canvas.height = 0
  return url
}

export interface PaginaDoPdf {
  /** Texto da página, já com os marcadores de negrito e título. */
  texto: string
  /** A página desenhada, em data URL. Só existe quando pedida. */
  imagem?: string
}

/**
 * Páginas do PDF uma a uma, opcionalmente com a imagem de cada uma.
 *
 * Existe separado de `extrairTextoPdf` porque no modo com imagem o corte em
 * pedaços deixa de ser por quantidade de caracteres e passa a ser POR PÁGINA:
 * a imagem e o texto de uma página precisam viajar na mesma chamada, senão a
 * IA vê uma figura sem o texto que a explica.
 */
export async function extrairPaginas(file: File, opcoes: { comImagens: boolean }): Promise<PaginaDoPdf[]> {
  const pdf = await abrirPdf(file)
  const textos = await extractText(pdf)

  const paginas: PaginaDoPdf[] = []
  for (let i = 0; i < textos.length; i++) {
    const texto = limparEspacos(textos[i])
    paginas.push(opcoes.comImagens ? { texto, imagem: await renderizarPagina(pdf, i + 1) } : { texto })
  }
  return paginas
}

// Tamanho de cada pedaço, em páginas.
//
// Este número já foi de 30 -> 25 -> 10 -> 6 -> 15. As duas primeiras quedas
// perseguiam um estouro de tempo que, no fim, era outra coisa (a função
// serverless tinha teto de 60s por engano meu, quando a plataforma permite
// 300s), e a subida pra 15 corrigiu isso — mas trocou um problema por outro.
//
// Agora o número sai de uma conta, não de tentativa e erro. Medindo o PDF
// real de 73 páginas: 1.628 caracteres por página, ou ~407 tokens. Cada
// chamada gasta os tokens de ENTRADA (o texto do pedaço) mais os de SAÍDA
// reservados (4.000 nos provedores gratuitos), e é a soma que conta contra os
// limites deles:
//
//   Groq (gpt-oss-120b grátis): 8.000 tokens por minuto, entrada + saída
//   Cerebras (grátis):          janela de contexto de 8K, entrada + saída
//
// Com 15 páginas: ~6.100 de entrada + 4.000 de saída = ~10.100. Estoura os
// dois. Ou seja, eu tinha silenciosamente DESLIGADO a Groq e a Cerebras da
// fila, deixando o app dependente só da OpenRouter (que sorteia um modelo
// diferente a cada chamada) e da Cohere. Menos etapas, mas muito mais frágil.
//
// Com 8 páginas: ~3.260 de entrada + 4.000 de saída = ~7.260. Cabe nos dois,
// e os cinco provedores voltam a ser utilizáveis.
//
// O custo disso é uma rodada a mais (73 páginas viram 9 pedaços em vez de 5),
// o que quase não pesa desde que as etapas passaram a rodar em paralelo: 3
// rodadas em vez de 2. Trocar uma rodada por três provedores de reserva é um
// negócio bom.
//
// Se um pedaço ainda não couber, `gerarComSubdivisao` racha aquele pedaço
// sozinho — então errar pra cima aqui é recuperável, errar pra baixo só
// desperdiça tempo.
const PAGINAS_POR_PARTE = 8

// Teto de segurança bem folgado, só pra nunca fazer um número absurdo de
// chamadas sequenciais num PDF extremamente longo — não é o critério
// principal (que é o tamanho médio por parte, PAGINAS_POR_PARTE).
const MAX_PARTES = 20

/** Quantas partes o sistema recomenda gerar separadamente pra um PDF com esse número de páginas (1 = não precisa dividir). */
export function partesRecomendadas(numPaginas: number): number {
  return Math.min(MAX_PARTES, Math.max(1, Math.round(numPaginas / PAGINAS_POR_PARTE)))
}

/**
 * Erro específico pra quando o PDF é grande demais pra gerar de uma vez só
 * (o servidor sinaliza isso via `tamanhoExcessivo` — ver api/gerar-aula.ts).
 * Carrega o texto já extraído do PDF e o número de páginas pra permitir
 * tentar de novo dividido em partes sem precisar reler o arquivo.
 */
export class PdfMuitoGrandeError extends Error {
  constructor(
    message: string,
    public readonly textoCompleto: string,
    public readonly numPaginas: number,
  ) {
    super(message)
    this.name = 'PdfMuitoGrandeError'
  }
}

async function gerarAulasDoTexto(
  texto: string,
  numPaginas: number,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  imagens?: string[],
): Promise<AulaImportPayload[]> {
  const corpo = JSON.stringify({
    texto,
    materiaOverride,
    nomeArquivo,
    chaveUsuario: chaveUsuario || undefined,
    paginas: imagens?.length ? imagens : undefined,
  })

  // Gerar uma aula é uma requisição longa (pode levar minutos), e em rede
  // móvel uma conexão parada esse tempo todo às vezes cai antes de responder.
  // Quando o `fetch` falha assim, o erro não diz nada de útil — é só "falhou".
  // Então tentamos de novo algumas vezes antes de desistir: quase sempre a
  // segunda tentativa passa, e o usuário nem percebe.
  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      // A sessão vai junto: a função serverless recusa quem não estiver
      // logado, e é ela quem confere o limite de PDFs — a tela só antecipa o
      // aviso. Ver `identificarUsuario` em api/gerar-aula.ts.
      const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = await tokenDaSessao()
      if (token) cabecalhos.Authorization = `Bearer ${token}`

      const resposta = await fetch('/api/gerar-aula', {
        method: 'POST',
        headers: cabecalhos,
        body: corpo,
      })
      return await interpretarResposta(resposta, texto, numPaginas)
    } catch (e) {
      // Um erro que já é NOSSO (formato/tamanho) não é falha de conexão:
      // repetir a chamada não mudaria nada, então sobe na hora.
      if (e instanceof PdfMuitoGrandeError || e instanceof RespostaDaIAError) throw e
      ultimoErro = e
      if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 2000))
    }
  }

  console.error('gerar aula: conexão falhou nas 3 tentativas:', ultimoErro)
  throw new Error(
    'A conexão com o servidor de IA caiu no meio do processo (tentei 3 vezes). Isso costuma acontecer em rede instável — confira sua internet e tente de novo.',
  )
}

/** Erro vindo da resposta do servidor (não é falha de conexão, então não adianta repetir a chamada). */
class RespostaDaIAError extends Error {}

async function interpretarResposta(resposta: Response, texto: string, numPaginas: number): Promise<AulaImportPayload[]> {
  const contentType = resposta.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    // Resposta que não é nossa — quase sempre a página de erro da própria
    // plataforma (função encerrada por tempo, crash, rota errada). Antes
    // isso virava uma mensagem genérica que não dizia nada; agora
    // registramos o status HTTP e um trecho do corpo, que é o que realmente
    // identifica a causa (ex.: 504 = tempo esgotado, 500 = falha na função).
    const status = resposta.status
    const corpo = (await resposta.text().catch(() => ''))
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
    const detalhe = corpo ? ` Resposta do servidor: "${corpo}"` : ''
    throw new PdfMuitoGrandeError(
      `O servidor de IA respondeu ${status} sem JSON — normalmente é o tempo limite do servidor com um trecho grande demais.${detalhe}`,
      texto,
      numPaginas,
    )
  }

  const dados = (await resposta.json()) as { ok: boolean; payload?: AulaImportPayload[]; error?: string; tamanhoExcessivo?: boolean }
  if (!resposta.ok || !dados.ok || !dados.payload?.length) {
    const mensagem = dados.error || 'Não foi possível gerar a aula a partir deste PDF.'
    if (dados.tamanhoExcessivo) throw new PdfMuitoGrandeError(mensagem, texto, numPaginas)
    throw new RespostaDaIAError(mensagem)
  }

  return dados.payload
}


/**
 * "PDF com IA" (Seção 6.3) — recebe o texto já extraído do PDF (ver
 * `extrairTextoPdf`) e manda pra função serverless `api/gerar-aula.ts`, que
 * chama o Gemini pra produzir um JSON semântico (sem HTML), compila esse
 * JSON no mesmo formato que o importador de .json manual usa
 * (`src/lib/lessonCompiler.ts`) e já revalida contra o schema final antes de
 * devolver. Mesmo assim, o resultado ainda passa por `validateAulaImport`
 * no ImportPanel, igual a qualquer importação de .json — a IA pode errar, a
 * validação é quem decide se entra na biblioteca. Um PDF com mais de uma
 * aula (ex.: "Aula 01", "Aula 02") devolve uma entrada por aula.
 *
 * Se o PDF for grande demais pra gerar de uma vez, lança `PdfMuitoGrandeError`
 * (em vez de um erro genérico) — o chamador pode oferecer dividir o PDF em
 * partes com `gerarAulaViaIADividida`, usando `error.textoCompleto`.
 */
export async function gerarAulaViaIA(
  texto: string,
  numPaginas: number,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
): Promise<AulaImportPayload[]> {
  return gerarAulasDoTexto(texto, numPaginas, materiaOverride, nomeArquivo, chaveUsuario)
}

/**
 * Divide o texto (já extraído por `extrairTextoPdf`) em `numPartes` partes e
 * gera cada uma como uma chamada separada — cada uma com seu próprio
 * orçamento de tempo/tokens na função serverless — juntando o resultado
 * como se fossem aulas de arquivos diferentes anexados juntos. Use
 * `partesRecomendadas` pra decidir quantas partes pedir.
 */
// Quantas etapas rodam ao mesmo tempo. Cada etapa é uma requisição separada
// à função serverless, então elas não disputam o tempo uma da outra — o que
// disputavam era só a paciência do usuário. Em série, um PDF de 73 páginas
// levava 12 chamadas enfileiradas; qualquer uma lenta segurava todas as
// outras, e a página do celular precisava ficar viva o tempo todo.
//
// 3 é conservador de propósito: acelera bastante sem disparar os limites por
// minuto dos tiers gratuitos (a Groq, por exemplo, tem só 8 mil tokens/min).
const ETAPAS_SIMULTANEAS = 3

export async function gerarAulaViaIADividida(
  textoCompleto: string,
  numPaginas: number,
  numPartes: number,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  onProgresso?: (concluidas: number, total: number) => void,
): Promise<AulaImportPayload[]> {
  const partes = dividirTextoEmPartes(textoCompleto, numPartes)
  const paginasPorParte = Math.max(1, Math.round(numPaginas / partes.length))

  // Guarda por índice, não por ordem de chegada: rodando em paralelo, a etapa
  // 5 pode terminar antes da 2, e a aula tem que sair na ordem do documento.
  const resultados: AulaImportPayload[][] = new Array(partes.length)
  let concluidas = 0
  let proxima = 0

  async function trabalhador() {
    while (proxima < partes.length) {
      const i = proxima++
      resultados[i] = await gerarComSubdivisao(partes[i], paginasPorParte, materiaOverride, nomeArquivo, chaveUsuario)
      onProgresso?.(++concluidas, partes.length)
    }
  }

  onProgresso?.(0, partes.length)
  // Se qualquer etapa falhar, `Promise.all` propaga o erro — que é o
  // comportamento certo: meia aula não serve.
  await Promise.all(Array.from({ length: Math.min(ETAPAS_SIMULTANEAS, partes.length) }, trabalhador))

  const aulas = resultados.flat()
  // Os pedaços são um detalhe interno de como driblamos o tempo limite do
  // servidor — o usuário mandou um PDF e espera uma aula, então costuramos
  // tudo de volta numa só antes de devolver.
  return mesclarAulasDoMesmoPdf(aulas)
}

// Quantas vezes uma parte que ainda falhou por tamanho pode ser rachada ao
// meio automaticamente. 3 níveis = uma parte pode virar até 8 pedaços — o
// suficiente pra salvar um trecho denso sem transformar a aula em caquinhos.
const MAX_SUBDIVISOES = 3

/**
 * Gera uma parte e, se ela ainda estourar o tempo/tamanho do servidor,
 * racha essa parte ao meio e tenta cada metade — recursivamente, até
 * `MAX_SUBDIVISOES` níveis. É o "se ajudar sozinho": em vez de devolver o
 * erro pro usuário e pedir pra ele resolver, o sistema tenta o próximo
 * tamanho que tem chance de caber.
 */
async function gerarComSubdivisao(
  texto: string,
  numPaginas: number,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  nivel = 0,
): Promise<AulaImportPayload[]> {
  try {
    return await gerarAulasDoTexto(texto, numPaginas, materiaOverride, nomeArquivo, chaveUsuario)
  } catch (e) {
    // Só vale rachar de novo se a falha foi por tamanho/tempo e o pedaço
    // ainda é grande o bastante pra dividir em dois trechos com conteúdo.
    if (!(e instanceof PdfMuitoGrandeError) || nivel >= MAX_SUBDIVISOES) throw e

    const metades = dividirTextoEmPartes(texto, 2)
    if (metades.length < 2) throw e

    const paginasPorMetade = Math.max(1, Math.round(numPaginas / 2))
    const aulas: AulaImportPayload[] = []
    for (const metade of metades) {
      aulas.push(...(await gerarComSubdivisao(metade, paginasPorMetade, materiaOverride, nomeArquivo, chaveUsuario, nivel + 1)))
    }
    return aulas
  }
}


/**
 * Quantas páginas viajam em cada chamada no modo com imagem.
 *
 * Medindo uma apostila de matemática de 40 páginas com gráfico: 86 kB por
 * página em WebP. Seis páginas dão meio megabyte — bem abaixo do teto de
 * pedido, com margem de sobra pra páginas muito mais densas que essa.
 *
 * Menor que as 8 do modo só-texto de propósito: aqui cada página pesa cerca
 * de cem vezes mais, e um pedido que estoura o tamanho falha inteiro.
 */
export const PAGINAS_POR_PARTE_COM_IMAGEM = 6

/**
 * Teto de páginas no modo com imagem.
 *
 * Medido: 106 ms por página pra desenhar num navegador de computador. Num
 * celular mediano isso é três a quatro vezes mais, então 40 páginas são uns
 * quinze segundos de preparo ANTES de a IA começar — o limite em que a espera
 * ainda parece "trabalhando" e não "travou".
 *
 * O outro motivo é a cota de quem ligou o modo: cada página como imagem custa
 * muitas vezes o que a mesma página custa em texto, e quem paga é a chave da
 * própria pessoa.
 */
export const MAX_PAGINAS_COM_IMAGEM = 40

/**
 * Quantas chamadas em paralelo no modo com imagem.
 *
 * Duas, e não três: cada chamada carrega meio megabyte de subida, e três ao
 * mesmo tempo numa rede móvel disputam a mesma banda estreita — sem contar o
 * limite de pedidos por minuto da chave gratuita do Gemini, que é de quem
 * ligou o modo.
 */
const ETAPAS_SIMULTANEAS_COM_IMAGEM = 2

/**
 * Gera a aula mandando as páginas desenhadas junto com o texto.
 *
 * O corte em pedaços aqui é POR PÁGINA, não por quantidade de caracteres como
 * no modo só-texto: a imagem de uma página e o texto dela precisam chegar na
 * mesma chamada, senão a IA vê uma figura sem o texto que a explica — ou pior,
 * o texto de uma página junto da figura de outra.
 */
export async function gerarAulaComImagens(
  paginas: PaginaDoPdf[],
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  onProgresso?: (concluidas: number, total: number) => void,
): Promise<AulaImportPayload[]> {
  const lotes: PaginaDoPdf[][] = []
  for (let i = 0; i < paginas.length; i += PAGINAS_POR_PARTE_COM_IMAGEM) {
    lotes.push(paginas.slice(i, i + PAGINAS_POR_PARTE_COM_IMAGEM))
  }

  const resultados: AulaImportPayload[][] = new Array(lotes.length)
  let concluidas = 0
  let proxima = 0

  async function trabalhador() {
    while (proxima < lotes.length) {
      const i = proxima++
      const lote = lotes[i]
      const texto = lote.map((p) => p.texto).filter(Boolean).join('\n\n')
      const imagens = lote.map((p) => p.imagem).filter((img): img is string => !!img)
      resultados[i] = await gerarAulasDoTexto(texto, lote.length, materiaOverride, nomeArquivo, chaveUsuario, imagens)
      onProgresso?.(++concluidas, lotes.length)
    }
  }

  onProgresso?.(0, lotes.length)
  await Promise.all(
    Array.from({ length: Math.min(ETAPAS_SIMULTANEAS_COM_IMAGEM, lotes.length) }, trabalhador),
  )

  return mesclarAulasDoMesmoPdf(resultados.flat())
}
