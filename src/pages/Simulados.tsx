import { ListChecks, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, type MateriaComContagem } from '../lib/repo'
import type { Questao } from '../lib/types'

function embaralhar<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Simulados() {
  const { user, perfil } = useAuth()
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])
  const [questoesPorMateria, setQuestoesPorMateria] = useState<Record<string, Questao[]>>({})
  const [materiaId, setMateriaId] = useState('')
  const [quantidade, setQuantidade] = useState(10)
  const [rodada, setRodada] = useState<Questao[] | null>(null)
  const [acertos, setAcertos] = useState(0)
  const [respondidas, setRespondidas] = useState(0)

  useEffect(() => {
    if (!user) return
    const podeVerBiblioteca = !!perfil?.isPremium || !!perfil?.isAdmin
    Promise.all([repo.listMaterias(user.id), podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([])]).then(
      async ([minhas, biblio]) => {
        const todas = [...minhas, ...biblio]
        setMaterias(todas)
        const mapa: Record<string, Questao[]> = {}
        for (const m of todas) {
          const aulas = await repo.listAulas(m.id)
          mapa[m.id] = aulas.flatMap((a) => a.questoes)
        }
        setQuestoesPorMateria(mapa)
      },
    )
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  const totalDisponivel = materiaId ? (questoesPorMateria[materiaId]?.length ?? 0) : 0

  const iniciar = () => {
    const banco = materiaId ? questoesPorMateria[materiaId] ?? [] : Object.values(questoesPorMateria).flat()
    setRodada(embaralhar(banco).slice(0, quantidade))
    setAcertos(0)
    setRespondidas(0)
  }

  const finalizado = rodada !== null && respondidas >= rodada.length

  if (rodada) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {Math.min(respondidas + (finalizado ? 0 : 1), rodada.length)}/{rodada.length} questões
          </p>
          <Button variant="ghost" onClick={() => setRodada(null)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            Encerrar
          </Button>
        </div>

        {finalizado && (
          <Card className="mb-4 text-center">
            <p className="text-2xl font-bold text-navy">
              {acertos}/{rodada.length}
            </p>
            <p className="text-sm text-slate-400">acertos neste simulado</p>
            <Button className="mt-3" onClick={() => setRodada(null)}>
              Novo simulado
            </Button>
          </Card>
        )}

        <div className="space-y-3">
          {rodada.map((q) => (
            <QuestionCard key={q.id} questao={q} onRespondida={(correta) => {
              setRespondidas((r) => r + 1)
              if (correta) setAcertos((a) => a + 1)
            }} />
          ))}
        </div>
      </div>
    )
  }

  if (materias.length === 0) {
    return <EmptyState icon={ListChecks} title="Você precisa de matérias com questões para montar um simulado" />
  }

  return (
    <div className="max-w-md">
      <Card className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Matéria</span>
          <select
            value={materiaId}
            onChange={(e) => setMateriaId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
          >
            <option value="">Todas as matérias</option>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} ({questoesPorMateria[m.id]?.length ?? 0} questões)
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Quantidade de questões</span>
          <input
            type="number"
            min={1}
            max={100}
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
          />
          {materiaId && <p className="mt-1 text-xs text-slate-400">{totalDisponivel} questões disponíveis nesta matéria</p>}
        </label>

        <Button onClick={iniciar} disabled={materiaId ? totalDisponivel === 0 : Object.values(questoesPorMateria).every((v) => v.length === 0)} className="w-full">
          Iniciar simulado
        </Button>
      </Card>
    </div>
  )
}
