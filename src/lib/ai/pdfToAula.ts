import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { AulaImportPayload } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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
 * PONTO DE INTEGRAÇÃO — "PDF com IA" (Seção 6.3)
 *
 * Esta é uma implementação STUB: ela só extrai o texto bruto do PDF (via
 * pdf.js) e monta uma aula de um único bloco "texto", sem identificar
 * capítulos, sem gerar caixas coloridas e sem extrair questões — porque
 * fazer isso de verdade exige uma chamada a um modelo de linguagem, e este
 * projeto ainda não está conectado a nenhum provedor de IA.
 *
 * Para religar isto a um modelo real: troque o corpo desta função por uma
 * chamada de API (ex.: Anthropic) que receba o texto de `extractText` e
 * devolva exatamente o JSON do contrato da Seção 6 (mesmo formato validado
 * por `validateAulaImport`). Todas as regras de 6.3 (nunca inventar
 * gabarito, preservar todas as questões, só usar caixas quando úteis etc.)
 * precisam ser aplicadas nesse prompt.
 */
export async function gerarAulaViaPdfStub(file: File, materiaOverride?: string): Promise<AulaImportPayload> {
  const paginas = await extractText(file)
  const textoCompleto = paginas.join('\n\n').trim()

  if (!textoCompleto) {
    throw new Error('Não foi possível extrair texto deste PDF (pode ser um PDF escaneado sem OCR).')
  }

  const tituloArquivo = file.name.replace(/\.pdf$/i, '')
  const paragrafos = textoCompleto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 40)

  const html =
    `<h3 class="subtitulo-aula">${escapeHtml(tituloArquivo)}</h3>` +
    paragrafos.map((p) => `<p>${escapeHtml(p)}</p>`).join('')

  return {
    materia: materiaOverride?.trim() || 'Importações (PDF)',
    aula: {
      titulo: tituloArquivo,
      blocos: [{ tipo: 'texto', ordem: 0, html }],
      questoes: [],
    },
  }
}
