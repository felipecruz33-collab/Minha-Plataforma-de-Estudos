import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { AulaImportPayload } from '../types'

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

/** Extrai o texto do PDF inteiro (todas as páginas, separadas por linha em branco) e a contagem de páginas. */
export async function extrairTextoPdf(file: File): Promise<{ texto: string; numPaginas: number }> {
  const paginas = await extractText(file)
  return { texto: paginas.join('\n\n').trim(), numPaginas: paginas.length }
}

// Um PDF muito longo tende a bater no orçamento de tempo da função (LIMITE_MS
// em api/gerar-aula.ts) ou no limite de tokens/minuto dos provedores de
// reserva gratuitos antes de terminar — daí o "resposta não veio em JSON".
// Por isso dividimos em partes de ~30 páginas em média, na página em vez do
// tamanho do texto (mais previsível pra quem está escolhendo o PDF).
const PAGINAS_POR_PARTE = 30

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
  let resposta: Response
  try {
    resposta = await fetch('/api/gerar-aula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, materiaOverride, nomeArquivo, chaveUsuario: chaveUsuario || undefined }),
    })
  } catch {
    throw new Error(
      'Não foi possível falar com o servidor de IA. Isso só funciona no site publicado (não no ambiente local de desenvolvimento).',
    )
  }

  const contentType = resposta.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    // Sem corpo JSON pra ler, mas na prática essa falha (function serverless
    // encerrada pela plataforma) costuma ser causada por um PDF grande
    // demais pro tempo disponível — mesmo alívio de dividir em mais partes.
    throw new PdfMuitoGrandeError('Endpoint de IA indisponível neste ambiente (resposta não veio em JSON).', texto, numPaginas)
  }

  const dados = (await resposta.json()) as { ok: boolean; payload?: AulaImportPayload[]; error?: string; tamanhoExcessivo?: boolean }
  if (!resposta.ok || !dados.ok || !dados.payload?.length) {
    const mensagem = dados.error || 'Não foi possível gerar a aula a partir deste PDF.'
    if (dados.tamanhoExcessivo) throw new PdfMuitoGrandeError(mensagem, texto, numPaginas)
    throw new Error(mensagem)
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
export async function gerarAulaViaIADividida(
  textoCompleto: string,
  numPaginas: number,
  numPartes: number,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  onProgresso?: (parte: number, total: number) => void,
): Promise<AulaImportPayload[]> {
  const partes = dividirTextoEmPartes(textoCompleto, numPartes)
  const paginasPorParte = Math.max(1, Math.round(numPaginas / partes.length))

  const aulas: AulaImportPayload[] = []
  for (let i = 0; i < partes.length; i++) {
    onProgresso?.(i + 1, partes.length)
    aulas.push(...(await gerarAulasDoTexto(partes[i], paginasPorParte, materiaOverride, nomeArquivo, chaveUsuario)))
  }
  return aulas
}
