import { XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import type { Resposta } from '../lib/types'

export default function Erradas() {
  const { user } = useAuth()
  const { questaoPorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  const ultimaPorQuestao = new Map<string, Resposta>()
  for (const r of respostas) {
    const atual = ultimaPorQuestao.get(r.questaoId)
    if (!atual || r.respondidoEm > atual.respondidoEm) ultimaPorQuestao.set(r.questaoId, r)
  }

  const erradas = Array.from(ultimaPorQuestao.values())
    .filter((r) => !r.correta)
    .map((r) => questaoPorId.get(r.questaoId))
    .filter((q): q is NonNullable<typeof q> => !!q)

  if (erradas.length === 0) {
    return <EmptyState icon={XCircle} title="Nenhuma questão errada por aqui" description="Continue assim! Questões que você errar por último aparecem nesta lista para revisão." />
  }

  return (
    <div className="space-y-3">
      {erradas.map((q) => (
        <QuestionCard key={q.id} questao={q} />
      ))}
    </div>
  )
}
