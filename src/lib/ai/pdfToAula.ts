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
 * "PDF com IA" (Seção 6.3) — extrai o texto do PDF no navegador (pdf.js) e
 * manda pra função serverless `api/gerar-aula.ts`, que chama a API da Claude
 * com o contrato da Seção 6 como saída estruturada. O resultado ainda passa
 * por `validateAulaImport` no ImportPanel, igual a qualquer importação de
 * .json — a IA pode errar, a validação é quem decide se entra na biblioteca.
 */
export async function gerarAulaViaIA(file: File, materiaOverride?: string): Promise<AulaImportPayload> {
  const paginas = await extractText(file)
  const texto = paginas.join('\n\n').trim()

  if (!texto) {
    throw new Error('Não foi possível extrair texto deste PDF (pode ser um PDF escaneado sem OCR).')
  }

  let resposta: Response
  try {
    resposta = await fetch('/api/gerar-aula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, materiaOverride, nomeArquivo: file.name }),
    })
  } catch {
    throw new Error(
      'Não foi possível falar com o servidor de IA. Isso só funciona no site publicado (não no ambiente local de desenvolvimento).',
    )
  }

  const contentType = resposta.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error('Endpoint de IA indisponível neste ambiente (resposta não veio em JSON).')
  }

  const dados = (await resposta.json()) as { ok: boolean; payload?: AulaImportPayload; error?: string }
  if (!resposta.ok || !dados.ok || !dados.payload) {
    throw new Error(dados.error || 'Não foi possível gerar a aula a partir deste PDF.')
  }

  return dados.payload
}
