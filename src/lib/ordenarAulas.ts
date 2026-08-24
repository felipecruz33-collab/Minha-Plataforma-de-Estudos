import type { Aula } from './types'

/**
 * Ordem de exibição das aulas dentro de uma matéria.
 *
 * Quem já organizou a lista manualmente tem `ordem` preenchida e manda. Quem
 * nunca organizou tem `ordem` nula e continua vendo tudo por data de criação,
 * como sempre foi — sem que nenhuma aula antiga precise ser "migrada" pra uma
 * posição inventada.
 *
 * Quando os dois casos convivem na mesma matéria (por exemplo, uma aula nova
 * importada depois de organizar), as organizadas ficam primeiro e as novas
 * entram no fim, que é onde a pessoa espera encontrar o que acabou de chegar.
 */
export function ordenarAulas<T extends Pick<Aula, 'ordem' | 'criadoEm' | 'titulo'>>(aulas: T[]): T[] {
  return [...aulas].sort((a, b) => {
    if (a.ordem !== null && b.ordem !== null) return a.ordem - b.ordem
    if (a.ordem !== null) return -1
    if (b.ordem !== null) return 1
    return a.criadoEm.localeCompare(b.criadoEm)
  })
}

/** Compara títulos como uma pessoa esperaria: "Aula 2" antes de "Aula 10", acentos e maiúsculas ignorados. */
export function compararTitulos(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}
