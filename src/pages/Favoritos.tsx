import { Star } from 'lucide-react'
import { useMemo } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { CarregarMais } from '../components/ui/CarregarMais'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'

export default function Favoritos() {
  const { perfil } = useAuth()
  const { questaoPorId, loading } = useTodasQuestoes()

  const favoritas = useMemo(
    () =>
      (perfil?.favoritos ?? [])
        .map((id) => questaoPorId.get(id))
        .filter((q): q is NonNullable<typeof q> => !!q),
    [perfil?.favoritos, questaoPorId],
  )

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
      {visiveis.map((q) => (
        <QuestionCard key={q.id} questao={q} />
      ))}
      <CarregarMais mostrando={visiveis.length} total={total} temMais={temMais} onVerMais={verMais} />
    </div>
  )
}
