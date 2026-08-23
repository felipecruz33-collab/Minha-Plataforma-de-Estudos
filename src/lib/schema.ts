import { TIPOS_BLOCO, type AulaImportPayload } from './types'

const TAGS_PERMITIDAS = new Set([
  'p', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
])

const TAGS_PROIBIDAS = new Set(['script', 'style', 'iframe', 'link', 'img', 'object', 'embed'])

export interface ValidationResult {
  valid: boolean
  errors: string[]
  data?: AulaImportPayload
}

function checkHtml(html: string, path: string, errors: string[]) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    errors.push(`${path}: html malformado`)
    return
  }
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (TAGS_PROIBIDAS.has(tag)) {
      errors.push(`${path}: tag proibida <${tag}>`)
    } else if (!TAGS_PERMITIDAS.has(tag)) {
      errors.push(`${path}: tag não permitida <${tag}>`)
    }
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) {
        errors.push(`${path}: atributo de evento não permitido "${attr.name}" em <${tag}>`)
      }
      if (attr.name.toLowerCase() === 'src' || (tag === 'img' && attr.name.toLowerCase() === 'src')) {
        errors.push(`${path}: imagens externas não são permitidas`)
      }
    }
    for (const child of Array.from(el.children)) walk(child)
  }
  for (const child of Array.from(doc.body.firstElementChild?.children ?? [])) walk(child)
}

/** Valida um payload de importação/geração contra o contrato técnico da Seção 6. */
export function validateAulaImport(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['JSON inválido: esperado um objeto na raiz'] }
  }
  const obj = raw as Record<string, unknown>

  const allowedTopLevel = new Set(['materia', 'aula'])
  for (const key of Object.keys(obj)) {
    if (!allowedTopLevel.has(key)) errors.push(`Campo inesperado na raiz: "${key}"`)
  }

  if (typeof obj.materia !== 'string' || !obj.materia.trim()) {
    errors.push('"materia" é obrigatório e deve ser texto não vazio')
  }

  if (typeof obj.aula !== 'object' || obj.aula === null) {
    errors.push('"aula" é obrigatório e deve ser um objeto')
    return { valid: false, errors }
  }
  const aula = obj.aula as Record<string, unknown>

  const allowedAula = new Set(['titulo', 'blocos', 'questoes'])
  for (const key of Object.keys(aula)) {
    if (!allowedAula.has(key)) errors.push(`Campo inesperado em "aula": "${key}"`)
  }

  if (typeof aula.titulo !== 'string' || !aula.titulo.trim()) {
    errors.push('"aula.titulo" é obrigatório e deve ser texto não vazio')
  }

  if (!Array.isArray(aula.blocos)) {
    errors.push('"aula.blocos" é obrigatório e deve ser uma lista')
  } else {
    const ordens = new Set<number>()
    aula.blocos.forEach((bloco, i) => {
      const path = `aula.blocos[${i}]`
      if (typeof bloco !== 'object' || bloco === null) {
        errors.push(`${path}: deve ser um objeto`)
        return
      }
      const b = bloco as Record<string, unknown>
      const allowedBloco = new Set(['tipo', 'ordem', 'html'])
      for (const key of Object.keys(b)) {
        if (!allowedBloco.has(key)) errors.push(`${path}: campo inesperado "${key}"`)
      }
      if (typeof b.tipo !== 'string' || !TIPOS_BLOCO.includes(b.tipo as (typeof TIPOS_BLOCO)[number])) {
        errors.push(`${path}: "tipo" inválido ("${String(b.tipo)}"); valores aceitos: ${TIPOS_BLOCO.join(', ')}`)
      }
      if (typeof b.ordem !== 'number' || !Number.isInteger(b.ordem) || b.ordem < 0) {
        errors.push(`${path}: "ordem" deve ser um inteiro >= 0`)
      } else if (ordens.has(b.ordem)) {
        errors.push(`${path}: "ordem" ${b.ordem} repetida dentro da aula`)
      } else {
        ordens.add(b.ordem)
      }
      if (typeof b.html !== 'string' || !b.html.trim()) {
        errors.push(`${path}: "html" é obrigatório e deve ser texto não vazio`)
      } else {
        checkHtml(b.html, path, errors)
      }
    })
  }

  if (!Array.isArray(aula.questoes)) {
    errors.push('"aula.questoes" é obrigatório e deve ser uma lista (pode ser vazia)')
  } else {
    aula.questoes.forEach((questao, i) => {
      const path = `aula.questoes[${i}]`
      if (typeof questao !== 'object' || questao === null) {
        errors.push(`${path}: deve ser um objeto`)
        return
      }
      const q = questao as Record<string, unknown>
      const stringFields = ['tema', 'banca', 'ano', 'orgao', 'enunciado', 'gabarito', 'explicacao']
      for (const field of stringFields) {
        if (typeof q[field] !== 'string') errors.push(`${path}: "${field}" deve ser texto`)
      }
      if (typeof q.tema !== 'string' || !q.tema.trim()) errors.push(`${path}: "tema" não pode ser vazio`)
      if (typeof q.enunciado !== 'string' || !q.enunciado.trim()) errors.push(`${path}: "enunciado" não pode ser vazio`)

      let ids: string[] = []
      if (!Array.isArray(q.alternativas) || q.alternativas.length < 2) {
        errors.push(`${path}: "alternativas" deve ser uma lista com pelo menos 2 itens`)
      } else {
        const seen = new Set<string>()
        q.alternativas.forEach((alt, j) => {
          if (typeof alt !== 'object' || alt === null) {
            errors.push(`${path}.alternativas[${j}]: deve ser um objeto`)
            return
          }
          const a = alt as Record<string, unknown>
          if (typeof a.id !== 'string' || !/^[A-E]$/.test(a.id)) {
            errors.push(`${path}.alternativas[${j}]: "id" deve ser uma letra única entre A e E`)
          } else if (seen.has(a.id)) {
            errors.push(`${path}.alternativas[${j}]: id "${a.id}" duplicado`)
          } else {
            seen.add(a.id)
          }
          if (typeof a.texto !== 'string' || !a.texto.trim()) {
            errors.push(`${path}.alternativas[${j}]: "texto" não pode ser vazio`)
          }
        })
        ids = Array.from(seen)
      }

      if (typeof q.gabarito === 'string' && ids.length && !ids.includes(q.gabarito)) {
        errors.push(`${path}: "gabarito" ("${q.gabarito}") não corresponde a nenhuma alternativa`)
      }

      if (typeof q.altExp !== 'object' || q.altExp === null || Array.isArray(q.altExp)) {
        errors.push(`${path}: "altExp" é obrigatório e deve ser um objeto`)
      } else {
        const altExp = q.altExp as Record<string, unknown>
        for (const id of ids) {
          if (typeof altExp[id] !== 'string' || !altExp[id]) {
            errors.push(`${path}: "altExp" está sem explicação para a alternativa "${id}"`)
          }
        }
      }
    })
  }

  if (errors.length > 0) return { valid: false, errors }

  return { valid: true, errors: [], data: raw as unknown as AulaImportPayload }
}
