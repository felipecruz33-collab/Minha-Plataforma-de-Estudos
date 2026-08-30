import { useMemo, useState } from 'react'
import { ordenarAulas } from '../ordenarAulas'

interface MateriaBasica {
  id: string
  nome: string
  isBiblioteca: boolean
}

interface AulaBasica {
  id: string
  materiaId: string
  titulo: string
  ordem: number | null
  criadoEm: string
}

export interface OpcaoMateria {
  id: string
  /** Já desambiguado quando duas matérias têm o mesmo nome. */
  rotulo: string
}

/**
 * O par de seletores "matéria → aula", com as regras que os dois lugares que
 * o usam precisam acertar igual.
 *
 * São duas regras que parecem detalhe e não são:
 *
 * 1. Trocar de matéria LIMPA a aula. Sem isso sobra uma aula de outra matéria
 *    selecionada, a lista zera e nada na tela explica por quê.
 * 2. O rótulo desambigua nomes repetidos. Uma matéria sua e uma da biblioteca
 *    podem se chamar igual; sem o rótulo elas viram a mesma opção.
 */
export function useFiltroMateriaAula(materias: MateriaBasica[], aulas: AulaBasica[]) {
  const [materiaId, setMateriaIdInterno] = useState('')
  const [aulaId, setAulaId] = useState('')

  function setMateriaId(id: string) {
    setMateriaIdInterno(id)
    setAulaId('')
  }

  const opcoesMateria = useMemo<OpcaoMateria[]>(() => {
    const vezes = new Map<string, number>()
    for (const m of materias) vezes.set(m.nome, (vezes.get(m.nome) ?? 0) + 1)
    return materias.map((m) => ({
      id: m.id,
      rotulo:
        (vezes.get(m.nome) ?? 0) > 1 ? `${m.nome} (${m.isBiblioteca ? 'Biblioteca' : 'Minha'})` : m.nome,
    }))
  }, [materias])

  const opcoesAula = useMemo(
    () => (materiaId ? ordenarAulas(aulas.filter((a) => a.materiaId === materiaId)) : []),
    [aulas, materiaId],
  )

  /** Se a questão/aula passa pelo filtro atual. */
  function combina(item: { materiaId: string; aulaId: string }): boolean {
    if (materiaId && item.materiaId !== materiaId) return false
    if (aulaId && item.aulaId !== aulaId) return false
    return true
  }

  return { materiaId, setMateriaId, aulaId, setAulaId, opcoesMateria, opcoesAula, combina }
}
