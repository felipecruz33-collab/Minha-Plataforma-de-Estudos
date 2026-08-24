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

/**
 * Erro específico pra quando o PDF é grande demais pra gerar de uma vez só
 * (o servidor sinaliza isso via `tamanhoExcessivo` — ver api/gerar-aula.ts).
 * Carrega o texto já extraído do PDF pra permitir tentar de novo dividido em
 * duas partes sem precisar reler o arquivo.
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
    // demais pro tempo disponível — mesmo alívio de dividir em duas partes.
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

// Procura uma quebra de parágrafo perto do meio do texto (janela de 20% pra
// cada lado) pra não cortar uma questão ou um parágrafo ao meio; se não
// achar nenhuma nessa janela, divide exatamente na metade mesmo assim.
function dividirTextoAoMeio(texto: string): [string, string] {
  const meio = Math.floor(texto.length / 2)
  const janela = Math.floor(texto.length * 0.2)
  const inicio = Math.max(0, meio - janela)
  const fim = Math.min(texto.length, meio + janela)

  const trecho = texto.slice(inicio, fim)
  const quebra = trecho.lastIndexOf('\n\n')
  const corte = quebra !== -1 ? inicio + quebra + 2 : meio

  return [texto.slice(0, corte).trim(), texto.slice(corte).trim()]
}

/**
 * "PDF com IA" (Seção 6.3) — extrai o texto do PDF no navegador (pdf.js) e
 * manda pra função serverless `api/gerar-aula.ts`, que chama o Gemini pra
 * produzir um JSON semântico (sem HTML), compila esse JSON no mesmo formato
 * que o importador de .json manual usa (`src/lib/lessonCompiler.ts`) e já
 * revalida contra o schema final antes de devolver. Mesmo assim, o resultado
 * ainda passa por `validateAulaImport` no ImportPanel, igual a qualquer
 * importação de .json — a IA pode errar, a validação é quem decide se entra
 * na biblioteca. Um PDF com mais de uma aula (ex.: "Aula 01", "Aula 02")
 * devolve uma entrada por aula.
 *
 * Se o PDF for grande demais pra gerar de uma vez, lança `PdfMuitoGrandeError`
 * (em vez de um erro genérico) — o chamador pode oferecer dividir o PDF em
 * duas partes com `gerarAulaViaIADividida`, usando `error.textoCompleto`.
 */
export async function gerarAulaViaIA(file: File, materiaOverride?: string, chaveUsuario?: string | null): Promise<AulaImportPayload[]> {
  const paginas = await extractText(file)
  const texto = paginas.join('\n\n').trim()

  if (!texto) {
    throw new Error('Não foi possível extrair texto deste PDF (pode ser um PDF escaneado sem OCR).')
  }

  return gerarAulasDoTexto(texto, materiaOverride, file.name, chaveUsuario)
}

/**
 * Divide o texto (já extraído por `gerarAulaViaIA`) ao meio e gera cada
 * metade como uma chamada separada — cada uma com seu próprio orçamento de
 * tempo/tokens na função serverless — juntando o resultado como se fossem
 * aulas de arquivos diferentes anexados juntos. Usado quando o PDF inteiro
 * é grande demais pra gerar de uma vez (`PdfMuitoGrandeError`).
 */
export async function gerarAulaViaIADividida(
  textoCompleto: string,
  materiaOverride: string | undefined,
  nomeArquivo: string,
  chaveUsuario: string | null | undefined,
  onProgresso?: (parte: 1 | 2) => void,
): Promise<AulaImportPayload[]> {
  const [parte1, parte2] = dividirTextoAoMeio(textoCompleto)

  onProgresso?.(1)
  const aulas1 = await gerarAulasDoTexto(parte1, materiaOverride, nomeArquivo, chaveUsuario)

  onProgresso?.(2)
  const aulas2 = await gerarAulasDoTexto(parte2, materiaOverride, nomeArquivo, chaveUsuario)

  return [...aulas1, ...aulas2]
}
