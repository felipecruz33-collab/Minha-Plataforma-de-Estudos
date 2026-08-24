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

/** Extrai o texto do PDF inteiro (todas as páginas, separadas por linha em branco). */
export async function extrairTextoPdf(file: File): Promise<string> {
  const paginas = await extractText(file)
  return paginas.join('\n\n').trim()
}

// Estimativa conservadora (não medida em produção — ajustar se ainda faltar
// tempo/tokens na prática) de até onde um PDF costuma gerar de uma vez só
// dentro do orçamento de tempo da função (LIMITE_MS em api/gerar-aula.ts) e
// do limite de tokens/minuto dos provedores de reserva gratuitos. Um PDF
// bem maior que isso tende a bater no "resposta não veio em JSON" (função
// encerrada pela plataforma) antes de terminar — por isso, nesse caso, nem
// tentamos de uma vez: já dividimos de saída, evitando a tentativa que
// sabemos que provavelmente vai falhar.
const TEXTO_SEGURO_CHARS = 90_000

// Não divide em mais partes que isso, mesmo pra PDFs enormes — cada parte
// vira uma "aula" separada na biblioteca, então fragmentar demais piora a
// experiência (muitas aulas pequenas em vez de poucas bem completas).
const MAX_PARTES = 4

/** Quantas partes o sistema recomenda gerar separadamente pra um texto desse tamanho (1 = não precisa dividir). */
export function partesRecomendadas(tamanhoTexto: number): number {
  return Math.min(MAX_PARTES, Math.max(1, Math.ceil(tamanhoTexto / TEXTO_SEGURO_CHARS)))
}

/**
 * Erro específico pra quando o PDF é grande demais pra gerar de uma vez só
 * (o servidor sinaliza isso via `tamanhoExcessivo` — ver api/gerar-aula.ts).
 * Carrega o texto já extraído do PDF pra permitir tentar de novo dividido em
 * partes sem precisar reler o arquivo.
 */
export class PdfMuitoGrandeError extends Error {
  constructor(
    message: string,
    public readonly textoCompleto: string,
  ) {
    super(message)
    this.name = 'PdfMuitoGrandeError'
  }
}

async function gerarAulasDoTexto(
  texto: string,
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
    throw new PdfMuitoGrandeError('Endpoint de IA indisponível neste ambiente (resposta não veio em JSON).', texto)
  }

  const dados = (await resposta.json()) as { ok: boolean; payload?: AulaImportPayload[]; error?: string; tamanhoExcessivo?: boolean }
  if (!resposta.ok || !dados.ok || !dados.payload?.length) {
    const mensagem = dados.error || 'Não foi possível gerar a aula a partir deste PDF.'
    if (dados.tamanhoExcessivo) throw new PdfMuitoGrandeError(mensagem, texto)
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
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
): Promise<AulaImportPayload[]> {
  return gerarAulasDoTexto(texto, materiaOverride, nomeArquivo, chaveUsuario)
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
  numPartes: number,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  onProgresso?: (parte: number, total: number) => void,
): Promise<AulaImportPayload[]> {
  const partes = dividirTextoEmPartes(textoCompleto, numPartes)

  const aulas: AulaImportPayload[] = []
  for (let i = 0; i < partes.length; i++) {
    onProgresso?.(i + 1, partes.length)
    aulas.push(...(await gerarAulasDoTexto(partes[i], materiaOverride, nomeArquivo, chaveUsuario)))
  }
  return aulas
}
