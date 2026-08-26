import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { podeVerBiblioteca as calcPodeVerBiblioteca } from '../premium'
import { repo, type AulaComQuestoes, type MateriaComContagem } from '../repo'
import type { Questao } from '../types'

/**
 * Carrega todas as aulas visíveis ao usuário (próprias + biblioteca, se
 * liberado) e indexa as questões.
 *
 * Sem os blocos de conteúdo: quem usa este hook — Erradas, Favoritos, Revisão
 * — mostra questões, nunca o texto da aula. Os blocos são a parte pesada do
 * tráfego, e eram baixados só pra serem descartados.
 */
export function useTodasQuestoes() {
  const { user, perfil } = useAuth()
  const [aulas, setAulas] = useState<AulaComQuestoes[]>([])
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const podeVerBiblioteca = calcPodeVerBiblioteca(perfil)
    Promise.all([repo.listMaterias(user.id), podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([])])
      .then(async ([minhas, biblio]) => {
        const todasMaterias = [...minhas, ...biblio]
        setMaterias(todasMaterias)
        // Uma consulta só, em vez de uma por matéria.
        setAulas(await repo.listAulasComQuestoes(todasMaterias.map((m) => m.id)))
      })
      .finally(() => setLoading(false))
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  const questaoPorId = useMemo(() => new Map<string, Questao>(aulas.flatMap((a) => a.questoes).map((q) => [q.id, q])), [aulas])
  const aulaPorId = useMemo(() => new Map(aulas.map((a) => [a.id, a])), [aulas])
  const materiaNomePorId = useMemo(() => new Map(materias.map((m) => [m.id, m.nome])), [materias])

  return { aulas, materias, questaoPorId, aulaPorId, materiaNomePorId, loading }
}
