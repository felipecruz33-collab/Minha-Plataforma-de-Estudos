import { repo } from './repo'
import type { Aula } from './types'

/**
 * Copia uma aula da Biblioteca compartilhada para a área pessoal do usuário.
 * Cria uma cópia independente: alterações/exclusões feitas por ele depois
 * (em "Início — Matérias") nunca afetam o item original da Biblioteca.
 */
export async function copiarAulaParaMinhaBiblioteca(userId: string, aula: Aula, materiaNome: string) {
  return repo.upsertAula(
    userId,
    {
      materia: materiaNome,
      aula: {
        titulo: aula.titulo,
        blocos: aula.blocos,
        questoes: aula.questoes.map((q) => ({
          tema: q.tema,
          banca: q.banca,
          ano: q.ano,
          orgao: q.orgao,
          enunciado: q.enunciado,
          alternativas: q.alternativas,
          gabarito: q.gabarito,
          explicacao: q.explicacao,
          altExp: q.altExp,
        })),
      },
    },
    { isBiblioteca: false },
  )
}
