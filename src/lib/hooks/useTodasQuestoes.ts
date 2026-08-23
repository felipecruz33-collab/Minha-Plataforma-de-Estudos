import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { repo, type MateriaComContagem } from '../repo'
import type { Aula, Questao } from '../types'

/** Carrega todas as aulas visíveis ao usuário (próprias + biblioteca, se liberado) e indexa as questões. */
export function useTodasQuestoes() {
  const { user, perfil } = useAuth()
  const [aulas, setAulas] = useState<Aula[]>([])
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const podeVerBiblioteca = !!perfil?.isPremium || !!perfil?.isAdmin
    Promise.all([repo.listMaterias(user.id), podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([])])
      .then(async ([minhas, biblio]) => {
        const todasMaterias = [...minhas, ...biblio]
        setMaterias(todasMaterias)
        const todasAulas = (await Promise.all(todasMaterias.map((m) => repo.listAulas(m.id)))).flat()
        setAulas(todasAulas)
      })
      .finally(() => setLoading(false))
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  const questaoPorId = useMemo(() => new Map<string, Questao>(aulas.flatMap((a) => a.questoes).map((q) => [q.id, q])), [aulas])
  const aulaPorId = useMemo(() => new Map(aulas.map((a) => [a.id, a])), [aulas])
  const materiaNomePorId = useMemo(() => new Map(materias.map((m) => [m.id, m.nome])), [materias])

  return { aulas, materias, questaoPorId, aulaPorId, materiaNomePorId, loading }
}
