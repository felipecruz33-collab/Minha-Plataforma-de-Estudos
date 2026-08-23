import { BarChart3 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, type MateriaComContagem } from '../lib/repo'
import type { Aula, Resposta } from '../lib/types'

interface Grupo {
  nome: string
  total: number
  acertos: number
}

function Barra({ grupo }: { grupo: Grupo }) {
  const pct = grupo.total ? Math.round((grupo.acertos / grupo.total) * 100) : 0
  const cor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate font-medium text-slate-700">{grupo.nome}</span>
        <span className="shrink-0 text-slate-400">
          {grupo.acertos}/{grupo.total} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function agrupar(respostas: Resposta[], keyFn: (r: Resposta) => string, nomeFn: (key: string) => string): Grupo[] {
  const mapa = new Map<string, { total: number; acertos: number }>()
  for (const r of respostas) {
    const key = keyFn(r)
    const atual = mapa.get(key) ?? { total: 0, acertos: 0 }
    atual.total += 1
    if (r.correta) atual.acertos += 1
    mapa.set(key, atual)
  }
  return Array.from(mapa.entries())
    .map(([key, v]) => ({ nome: nomeFn(key), total: v.total, acertos: v.acertos }))
    .sort((a, b) => b.total - a.total)
}

export default function Desempenho() {
  const { user } = useAuth()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)
  const [aulas, setAulas] = useState<Aula[]>([])
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])

  useEffect(() => {
    if (!user) return
    Promise.all([repo.listRespostas(user.id), repo.listTodasAulas(user.id, true), repo.listMaterias(user.id)]).then(
      ([r, a, m]) => {
        setRespostas(r)
        setAulas(a)
        setMaterias(m)
      },
    )
  }, [user])

  const aulaPorId = useMemo(() => new Map(aulas.map((a) => [a.id, a])), [aulas])
  const materiaPorId = useMemo(() => new Map(materias.map((m) => [m.id, m.nome])), [materias])
  const questaoPorId = useMemo(() => new Map(aulas.flatMap((a) => a.questoes).map((q) => [q.id, q])), [aulas])

  const porMateria = useMemo(
    () => (respostas ? agrupar(respostas, (r) => r.materiaId, (id) => materiaPorId.get(id) ?? 'Matéria removida') : []),
    [respostas, materiaPorId],
  )
  const porAula = useMemo(
    () => (respostas ? agrupar(respostas, (r) => r.aulaId, (id) => aulaPorId.get(id)?.titulo ?? 'Aula removida') : []),
    [respostas, aulaPorId],
  )
  const porAssunto = useMemo(
    () =>
      respostas
        ? agrupar(respostas, (r) => questaoPorId.get(r.questaoId)?.tema || '(sem assunto)', (t) => t)
        : [],
    [respostas, questaoPorId],
  )

  if (respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (respostas.length === 0) {
    return <EmptyState icon={BarChart3} title="Você ainda não respondeu nenhuma questão" description="Suas estatísticas de acerto e erro aparecem aqui." />
  }

  const totalAcertos = respostas.filter((r) => r.correta).length
  const pctGeral = Math.round((totalAcertos / respostas.length) * 100)

  return (
    <div className="space-y-6">
      <Card className="text-center">
        <p className="text-3xl font-bold text-navy">{pctGeral}%</p>
        <p className="text-sm text-slate-400">
          de aproveitamento geral · {totalAcertos}/{respostas.length} questões
        </p>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Por matéria</h2>
        <Card>{porMateria.map((g) => <Barra key={g.nome} grupo={g} />)}</Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Por aula</h2>
        <Card>{porAula.map((g) => <Barra key={g.nome} grupo={g} />)}</Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Por assunto</h2>
        <Card>{porAssunto.map((g) => <Barra key={g.nome} grupo={g} />)}</Card>
      </section>
    </div>
  )
}
