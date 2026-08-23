import { Bot, CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { GeracaoIA } from '../lib/types'

export default function Geracoes() {
  const { user } = useAuth()
  const [geracoes, setGeracoes] = useState<GeracaoIA[] | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listGeracoes(user.id).then(setGeracoes)
  }, [user])

  if (geracoes === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (geracoes.length === 0) {
    return <EmptyState icon={Bot} title="Nenhuma geração via IA ainda" description='Use a aba "PDF com IA" em Adicionar conteúdo para gerar aulas automaticamente.' />
  }

  return (
    <div className="space-y-2">
      {geracoes.map((g) => (
        <Card key={g.id} className="flex items-start gap-3">
          {g.status === 'concluido' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" strokeWidth={1.75} />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" strokeWidth={1.75} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-navy">{g.nomeArquivo}</p>
            <p className="text-xs text-slate-400">
              {g.materia} {g.aulaTitulo !== '—' && `· ${g.aulaTitulo}`}
            </p>
            {g.mensagem && <p className="mt-1 text-xs text-rose-500">{g.mensagem}</p>}
            <p className="mt-1 text-xs text-slate-300">{new Date(g.criadoEm).toLocaleString('pt-BR')}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
