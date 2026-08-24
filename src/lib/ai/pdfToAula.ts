import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { AulaImportPayload } from '../types'
import { mesclarAulasDoMesmoPdf } from './mesclarAulas'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

async function extractText(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pages.push(text)
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
  const paginas = await extractText(file)
  const texto = paginas
    .map(limparEspacos)
    .filter(Boolean)
    .join('\n\n')
  return { texto, numPaginas: paginas.length }
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
): Promise<AulaImportPayload[]> {
  const corpo = JSON.stringify({ texto, materiaOverride, nomeArquivo, chaveUsuario: chaveUsuario || undefined })

  // Gerar uma aula é uma requisição longa (pode levar minutos), e em rede
  // móvel uma conexão parada esse tempo todo às vezes cai antes de responder.
  // Quando o `fetch` falha assim, o erro não diz nada de útil — é só "falhou".
  // Então tentamos de novo algumas vezes antes de desistir: quase sempre a
  // segunda tentativa passa, e o usuário nem percebe.
  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resposta = await fetch('/api/gerar-aula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

// Acha, dentro de uma janela ao redor do alvo, a quebra de parágrafo mais
// próxima dele — pra não cortar uma questão ou um parágrafo ao meio. Sem
// nenhuma quebra na janela, corta exatamente no alvo mesmo assim.
function corteMaisProximo(texto: string, alvo: number, janela: number): number {
  const inicio = Math.max(0, alvo - janela)
  const fim = Math.min(texto.length, alvo + janela)
  const trecho = texto.slice(inicio, fim)

  let melhorCorte = -1
  let melhorDistancia = Infinity
  let pos = trecho.indexOf('\n\n')
  while (pos !== -1) {
    const corteAbsoluto = inicio + pos + 2
    const distancia = Math.abs(corteAbsoluto - alvo)
    if (distancia < melhorDistancia) {
      melhorDistancia = distancia
      melhorCorte = corteAbsoluto
    }
    pos = trecho.indexOf('\n\n', pos + 2)
  }
  return melhorCorte !== -1 ? melhorCorte : alvo
}

// Divide o texto em N partes de tamanho parecido, cada corte preferindo uma
// quebra de parágrafo perto do ponto ideal (i/numPartes do texto todo).
function dividirTextoEmPartes(texto: string, numPartes: number): string[] {
  if (numPartes <= 1) return [texto.trim()]

  const janela = Math.floor((texto.length / numPartes) * 0.2)
  const cortes = Array.from({ length: numPartes - 1 }, (_, i) => {
    const alvo = Math.floor((texto.length * (i + 1)) / numPartes)
    return corteMaisProximo(texto, alvo, janela)
  })
  const cortesUnicos = Array.from(new Set(cortes)).sort((a, b) => a - b)

  const partes: string[] = []
  let anterior = 0
  for (const corte of cortesUnicos) {
    partes.push(texto.slice(anterior, corte).trim())
    anterior = corte
  }
  partes.push(texto.slice(anterior).trim())
  return partes.filter((p) => p.length > 0)
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
