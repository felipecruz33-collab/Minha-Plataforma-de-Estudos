import { Star } from 'lucide-react'
import { QuestionCard } from '../components/QuestionCard'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'

export default function Favoritos() {
  const { perfil } = useAuth()
  const { questaoPorId, loading } = useTodasQuestoes()

  if (loading) return <p className="text-sm text-slate-400">Carregando…</p>

  const favoritas = (perfil?.favoritos ?? []).map((id) => questaoPorId.get(id)).filter((q): q is NonNullable<typeof q> => !!q)

  if (favoritas.length === 0) {
    return <EmptyState icon={Star} title="Nenhuma questão favoritada ainda" description='Toque na estrela de uma questão para guardá-la aqui.' />
  }

  return (
    <div className="space-y-3">
      {favoritas.map((q) => (
        <QuestionCard key={q.id} questao={q} />
      ))}
    </div>
  )
}
