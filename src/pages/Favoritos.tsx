import { ListChecks, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QuestionCard } from '../components/QuestionCard'
import { Card } from '../components/ui/Card'
import { CarregarMais } from '../components/ui/CarregarMais'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import type { Resposta } from '../lib/types'

export default function Favoritos() {
  const { user, perfil } = useAuth()
  const { questaoPorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelado = false
    repo.listRespostas(user.id).then((rs) => !cancelado && setRespostas(rs))
    return () => {
      cancelado = true
    }
  }, [user])

  const favoritas = useMemo(
    () =>
      (perfil?.favoritos ?? [])
        .map((id) => questaoPorId.get(id))
        .filter((q): q is NonNullable<typeof q> => !!q),
    [perfil?.favoritos, questaoPorId],
  )

  /**
   * Quantas favoritas nunca foram respondidas.
   *
   * Favoritar é guardar, e guardar dá a sensação de ter feito algo — a mesma
   * sensação de reler ou sublinhar, que Dunlosky e colegas (2013) classificam
   * como técnica de baixa utilidade. Uma estrela só vira estudo quando a
   * questão é respondida de novo. Dizer isso aqui, com o número na mão, é
   * mais honesto do que deixar a lista crescer parecendo progresso.
   */
  const naoRespondidas = useMemo(() => {
    if (!respostas) return 0
    const respondidas = new Set(respostas.map((r) => r.questaoId))
    return favoritas.filter((q) => !respondidas.has(q.id)).length
  }, [favoritas, respostas])

  const { visiveis, total, temMais, verMais } = useListaVisivel(favoritas)

  if (loading) return <p className="text-sm text-slate-400">Carregando…</p>

  if (favoritas.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Nenhuma questão favoritada ainda"
        description="Toque na estrela de uma questão para guardá-la aqui."
      />
    )
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-slate-600">
          <strong className="text-navy">{favoritas.length}</strong>{' '}
          {favoritas.length === 1 ? 'questão guardada' : 'questões guardadas'}
          {naoRespondidas > 0 && (
            <>
              {' · '}
              <strong className="text-amber-600">{naoRespondidas}</strong> que você nunca respondeu
            </>
          )}
          .{' '}
          <span className="text-slate-400">
            Guardar não é estudar — a estrela só rende quando a questão volta a ser respondida.
          </span>
        </p>
        <Link
          to="/simulados"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2 text-sm font-semibold text-white"
        >
          <ListChecks className="h-4 w-4" strokeWidth={2} />
          Simulado das favoritas
        </Link>
      </Card>

      {visiveis.map((q) => (
        <QuestionCard key={q.id} questao={q} />
      ))}
      <CarregarMais mostrando={visiveis.length} total={total} temMais={temMais} onVerMais={verMais} />
    </div>
  )
}
