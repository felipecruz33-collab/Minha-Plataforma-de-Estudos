import type { AulaGeradaIntermediate, BlocoIntermediate } from './aiIntermediateSchema'
import type { AulaImportPayload } from './types'

/**
 * Transforma o JSON semântico que a IA devolve (`aiIntermediateSchema.ts`)
 * no formato final que o importador já usa (`AulaImportPayload`, o mesmo
 * contrato de um `.json` importado manualmente). A IA nunca escreve HTML —
 * só este arquivo gera HTML, a partir de templates fixos, então o resultado
 * é seguro por construção (não depende de sanitizar HTML arbitrário da IA
 * depois). `ordem` também é atribuída aqui, pela posição no array.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Só suporta **negrito** — é o único destaque que a IA usa (Seção 6.3: palavra/trecho que muda o sentido). */
function formatarTexto(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function paragrafos(conteudo?: string): string {
  if (!conteudo) return ''
  return conteudo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${formatarTexto(p)}</p>`)
    .join('')
}

function listaItens(itens?: string[]): string {
  if (!itens?.length) return ''
  return `<ul>${itens.map((i) => `<li>${formatarTexto(i)}</li>`).join('')}</ul>`
}

function tabelaHtml(colunas?: string[], linhas?: string[][]): string {
  if (!colunas?.length || !linhas?.length) return ''
  const thead = `<thead><tr>${colunas.map((c) => `<th>${formatarTexto(c)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${linhas.map((linha) => `<tr>${linha.map((cel) => `<td>${formatarTexto(cel)}</td>`).join('')}</tr>`).join('')}</tbody>`
  return `<table>${thead}${tbody}</table>`
}

const BOX_META: Partial<Record<BlocoIntermediate['tipo'], { classe: string; emoji: string; tituloPadrao: string }>> = {
  dica: { classe: 'box dica', emoji: '📘', tituloPadrao: 'Dica de prova' },
  alerta: { classe: 'box alerta', emoji: '⚠️', tituloPadrao: 'Alerta / Pegadinha' },
  memorize: { classe: 'box memorize', emoji: '✅', tituloPadrao: 'Memorize' },
  exemplo: { classe: 'box exemplo', emoji: '💡', tituloPadrao: 'Exemplo' },
  palavra: { classe: 'box palavra', emoji: '🔎', tituloPadrao: 'Atenção à palavra' },
}

function compilarBlocoHtml(bloco: BlocoIntermediate): string {
  if (bloco.tipo === 'texto') {
    const partes: string[] = []
    if (bloco.titulo?.trim()) partes.push(`<h3 class="subtitulo-aula">${formatarTexto(bloco.titulo)}</h3>`)
    partes.push(paragrafos(bloco.conteudo))
    for (const sub of bloco.subtopicos ?? []) {
      partes.push(`<h4 class="miolo">${formatarTexto(sub.titulo)}</h4>`)
      partes.push(paragrafos(sub.conteudo))
    }
    return partes.join('')
  }

  if (bloco.tipo === 'tabela') {
    return tabelaHtml(bloco.colunas, bloco.linhas)
  }

  if (bloco.tipo === 'naoconfunda') {
    const titulo = bloco.titulo?.trim() || 'Não confunda'
    const corpo = bloco.itens?.length ? listaItens(bloco.itens) : paragrafos(bloco.conteudo)
    return `<div class="naoconfunda"><div class="naoconfunda-title">🚫 ${formatarTexto(titulo)}</div>${corpo}${tabelaHtml(bloco.colunas, bloco.linhas)}</div>`
  }

  const meta = BOX_META[bloco.tipo]!
  const titulo = bloco.titulo?.trim() || meta.tituloPadrao
  const corpo = bloco.tipo === 'memorize' && bloco.itens?.length ? listaItens(bloco.itens) : paragrafos(bloco.conteudo)
  return `<div class="${meta.classe}"><div class="box-title">${meta.emoji} ${formatarTexto(titulo)}</div>${corpo}</div>`
}

export function compilarAulas(intermediate: AulaGeradaIntermediate): AulaImportPayload[] {
  return intermediate.aulas.map((aulaInt) => ({
    materia: intermediate.materia,
    aula: {
      titulo: aulaInt.titulo,
      blocos: aulaInt.blocos
        .map((b, i) => ({ tipo: b.tipo, ordem: i, html: compilarBlocoHtml(b) }))
        .filter((b) => b.html.trim().length > 0),
      questoes: aulaInt.questoes,
    },
  }))
}
