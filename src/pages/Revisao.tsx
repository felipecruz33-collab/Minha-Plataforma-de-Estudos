import { AlertTriangle, PartyPopper, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { useAuth } from '../lib/auth/AuthContext'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import type { Resposta } from '../lib/types'

const MIN_TENTATIVAS = 3

export default function Revisao() {
  const { user } = useAuth()
  const { questaoPorId, aulaPorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  const porAssunto = new Map<string, { total: number; erros: number }>()
  const porAula = new Map<string, { total: number; acertos: number }>()

  for (const r of respostas) {
    const tema = questaoPorId.get(r.questaoId)?.tema || '(sem assunto)'
    const a1 = porAssunto.get(tema) ?? { total: 0, erros: 0 }
    a1.total += 1
    if (!r.correta) a1.erros += 1
    porAssunto.set(tema, a1)

    const a2 = porAula.get(r.aulaId) ?? { total: 0, acertos: 0 }
    a2.total += 1
    if (r.correta) a2.acertos += 1
    porAula.set(r.aulaId, a2)
  }

  const assuntosAlerta = Array.from(porAssunto.entries())
    .filter(([, v]) => v.total >= MIN_TENTATIVAS && v.erros / v.total > 0.4)
    .sort((a, b) => b[1].erros / b[1].total - a[1].erros / a[1].total)

  const aulasAlerta = Array.from(porAula.entries())
    .filter(([, v]) => v.total >= MIN_TENTATIVAS && v.acertos / v.total < 0.7)
    .sort((a, b) => a[1].acertos / a[1].total - b[1].acertos / b[1].total)

  const semAlertas = assuntosAlerta.length === 0 && aulasAlerta.length === 0

  if (semAlertas) {
    return (
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <PartyPopper className="h-10 w-10 text-brand-blue" strokeWidth={1.5} />
        <p className="font-semibold text-navy">Tudo em dia por aqui!</p>
        <p className="max-w-sm text-sm text-slate-400">
          Nenhum assunto ou aula com aproveitamento baixo no momento. Continue respondendo questões para manter suas
          revisões atualizadas.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {assuntosAlerta.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
            <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={1.75} />
            Assuntos com mais erro
          </h2>
          <div className="space-y-2">
            {assuntosAlerta.map(([tema, v]) => (
              <Card key={tema} className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{tema}</span>
                <span className="text-sm text-rose-500">
                  {v.erros}/{v.total} erros
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      {aulasAlerta.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
            <Sparkles className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
            Aulas com aproveitamento abaixo de 70%
          </h2>
          <div className="space-y-2">
            {aulasAlerta.map(([aulaId, v]) => (
              <Card key={aulaId} className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{aulaPorId.get(aulaId)?.titulo ?? 'Aula removida'}</span>
                <span className="text-sm text-amber-600">{Math.round((v.acertos / v.total) * 100)}%</span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
