/**
 * Separar o que é seu do que é da biblioteca compartilhada.
 *
 * As duas coisas convivem na mesma lista em várias telas, e é comum ter uma
 * matéria sua e uma da biblioteca com o MESMO nome — "Português" copiado da
 * biblioteca ao lado do "Português" que você montou. Numa lista misturada, as
 * duas viram a mesma linha, e a pessoa escolhe no escuro.
 *
 * Duas ferramentas aqui, e elas se completam:
 *
 * - `agruparPorOrigem` separa a lista em duas seções. Resolve o "misturadas"
 *   sempre, mesmo quando os nomes são diferentes.
 * - `nomesDuplicados` diz quais nomes aparecem dos dois lados, pra marcar SÓ
 *   esses onde não cabe uma seção (dentro de um `select`, por exemplo).
 *   Carimbar todos seria ruído: quem tem um nome só não precisa de aviso.
 */

export const GRUPO_MINHAS = 'Minhas matérias'
export const GRUPO_BIBLIOTECA = 'Biblioteca compartilhada'

export function agruparPorOrigem<T extends { isBiblioteca: boolean }>(lista: T[]): { minhas: T[]; biblioteca: T[] } {
  return {
    minhas: lista.filter((m) => !m.isBiblioteca),
    biblioteca: lista.filter((m) => m.isBiblioteca),
  }
}

/** Nomes que aparecem mais de uma vez na lista — os únicos que precisam de carimbo. */
export function nomesDuplicados(materias: { nome: string }[]): Set<string> {
  const vezes = new Map<string, number>()
  for (const m of materias) vezes.set(m.nome, (vezes.get(m.nome) ?? 0) + 1)
  return new Set(Array.from(vezes.entries()).filter(([, n]) => n > 1).map(([nome]) => nome))
}

/** Nome pronto pra um `<option>`, desambiguado só quando precisa. */
export function rotuloDaMateria(m: { nome: string; isBiblioteca: boolean }, duplicados: Set<string>): string {
  if (!duplicados.has(m.nome)) return m.nome
  return `${m.nome} (${m.isBiblioteca ? 'Biblioteca' : 'Minha'})`
}
