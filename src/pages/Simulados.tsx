import { Clock, ListChecks, Play, RotateCcw, Target, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, type MateriaComContagem } from '../lib/repo'
import type { Questao, Simulado, SimuladoMateria } from '../lib/types'

function embaralhar<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatarTempo(segundosTotais: number): string {
  const s = Math.max(0, Math.floor(segundosTotais))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function corPct(pct: number): string {
  return pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'
}

function nomePadrao(): string {
  return `Simulado de ${new Date().toLocaleDateString('pt-BR')}`
}

interface ConfigAtiva {
  nome: string
  materias: { materiaId: string; materiaNome: string; quantidade: number }[]
  tempoLimiteSegundos: number | null
}

export default function Simulados() {
  const { user, perfil } = useAuth()
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])
  const [questoesPorMateria, setQuestoesPorMateria] = useState<Record<string, Questao[]>>({})
  const [historico, setHistorico] = useState<Simulado[] | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Simulado | null>(null)

  const [nome, setNome] = useState(nomePadrao())
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [usarTempo, setUsarTempo] = useState(false)
  const [tempoMinutos, setTempoMinutos] = useState(30)

  const [config, setConfig] = useState<ConfigAtiva | null>(null)
  const [rodada, setRodada] = useState<Questao[] | null>(null)
  const [respostasStatus, setRespostasStatus] = useState<Record<string, boolean>>({})
  const [inicioEm, setInicioEm] = useState(0)
  const [agora, setAgora] = useState(0)
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)
  const [salvo, setSalvo] = useState(false)

  function carregarHistorico() {
    if (!user) return
    repo.listSimulados(user.id).then(setHistorico)
  }

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
    carregarHistorico()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  useEffect(() => {
    if (!rodada) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [rodada])

  const materiasComQuestoes = useMemo(() => materias.filter((m) => (questoesPorMateria[m.id]?.length ?? 0) > 0), [materias, questoesPorMateria])
  const totalSelecionado = useMemo(() => Object.values(quantidades).reduce((a, b) => a + b, 0), [quantidades])

  function definirQuantidade(materiaId: string, disponivel: number, valor: number) {
    const clamped = Math.max(0, Math.min(disponivel, Math.floor(valor) || 0))
    setQuantidades((q) => ({ ...q, [materiaId]: clamped }))
  }

  function iniciar() {
    const materiasEscolhidas = materiasComQuestoes
      .filter((m) => (quantidades[m.id] ?? 0) > 0)
      .map((m) => ({ materiaId: m.id, materiaNome: m.nome, quantidade: quantidades[m.id] }))

    const banco = materiasEscolhidas.flatMap((m) => embaralhar(questoesPorMateria[m.materiaId] ?? []).slice(0, m.quantidade))

    setConfig({
      nome: nome.trim() || nomePadrao(),
      materias: materiasEscolhidas,
      tempoLimiteSegundos: usarTempo ? tempoMinutos * 60 : null,
    })
    setRodada(embaralhar(banco))
    setRespostasStatus({})
    setSalvo(false)
    const agoraMs = Date.now()
    setInicioEm(agoraMs)
    setAgora(agoraMs)
  }

  async function finalizar() {
    if (!user || !config || !rodada || salvo) return
    setSalvo(true)

    const respondidasIds = Object.keys(respostasStatus)
    if (respondidasIds.length === 0) return

    const acertos = respondidasIds.filter((qid) => respostasStatus[qid]).length
    const materiasResultado: SimuladoMateria[] = config.materias
      .map((m) => {
        const idsDaMateria = new Set(rodada.filter((q) => q.materiaId === m.materiaId).map((q) => q.id))
        const respondidasDaMateria = respondidasIds.filter((qid) => idsDaMateria.has(qid))
        return {
          materiaId: m.materiaId,
          materiaNome: m.materiaNome,
          quantidade: respondidasDaMateria.length,
          acertos: respondidasDaMateria.filter((qid) => respostasStatus[qid]).length,
        }
      })
      .filter((m) => m.quantidade > 0)

    await repo.registrarSimulado({
      userId: user.id,
      nome: config.nome,
      materias: materiasResultado,
      tempoLimiteSegundos: config.tempoLimiteSegundos,
      duracaoSegundos: Math.round((Date.now() - inicioEm) / 1000),
      totalQuestoes: respondidasIds.length,
      acertos,
    })
    carregarHistorico()
  }

  const respondidas = Object.keys(respostasStatus).length
  const acertosAtuais = Object.values(respostasStatus).filter(Boolean).length
  const finalizado = rodada !== null && respondidas >= rodada.length

  useEffect(() => {
    if (finalizado) finalizar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizado])

  function encerrarAgora() {
    finalizar()
    setConfirmarEncerrar(false)
    setRodada(null)
    setConfig(null)
  }

  async function confirmarExclusaoHistorico() {
    if (!paraExcluir) return
    await repo.deleteSimulado(paraExcluir.id)
    setParaExcluir(null)
    carregarHistorico()
  }

  if (rodada && config) {
    const decorridoSegundos = Math.floor((agora - inicioEm) / 1000)
    const temLimite = config.tempoLimiteSegundos !== null
    const restanteSegundos = temLimite ? config.tempoLimiteSegundos! - decorridoSegundos : null
    const estourou = restanteSegundos !== null && restanteSegundos <= 0
    const progresso = rodada.length ? Math.round((respondidas / rodada.length) * 100) : 0

    return (
      <div>
        <Card className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-navy">{config.nome}</p>
              <p className="text-xs text-slate-400">
                {respondidas}/{rodada.length} questões
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums ${
                  estourou ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-navy'
                }`}
              >
                <Clock className="h-4 w-4" strokeWidth={2} />
                {formatarTempo(restanteSegundos ?? decorridoSegundos)}
              </span>
              <Button variant="ghost" onClick={() => setConfirmarEncerrar(true)}>
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                Encerrar
              </Button>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-gradient transition-all" style={{ width: `${progresso}%` }} />
          </div>
        </Card>

        {finalizado && (
          <Card className="mb-4 text-center">
            <p className={`text-3xl font-bold ${corPct(rodada.length ? Math.round((acertosAtuais / rodada.length) * 100) : 0)}`}>
              {acertosAtuais}/{rodada.length}
            </p>
            <p className="text-sm text-slate-400">
              acertos · {formatarTempo(decorridoSegundos)} de duração · salvo no histórico
            </p>
            <Button
              className="mt-3"
              onClick={() => {
                setRodada(null)
                setConfig(null)
              }}
            >
              Novo simulado
            </Button>
          </Card>
        )}

        <div className="space-y-3">
          {rodada.map((q) => (
            <QuestionCard
              key={q.id}
              questao={q}
              onRespondida={(correta) => setRespostasStatus((r) => ({ ...r, [q.id]: correta }))}
            />
          ))}
        </div>

        <ConfirmDialog
          open={confirmarEncerrar}
          title="Encerrar este simulado?"
          description={
            respondidas > 0
              ? `Você respondeu ${respondidas} de ${rodada.length} questões — o resultado até aqui fica salvo no histórico.`
              : 'Nenhuma questão foi respondida ainda, então nada será salvo no histórico.'
          }
          confirmLabel="Encerrar"
          onConfirm={encerrarAgora}
          onCancel={() => setConfirmarEncerrar(false)}
        />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      {materiasComQuestoes.length === 0 ? (
        <EmptyState icon={ListChecks} title="Você precisa de matérias com questões para montar um simulado" />
      ) : (
        <Card className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nome do simulado</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={nomePadrao()}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Quantas questões de cada matéria</span>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {materiasComQuestoes.map((m) => {
                const disponivel = questoesPorMateria[m.id]?.length ?? 0
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{m.nome}</p>
                      <button
                        type="button"
                        onClick={() => definirQuantidade(m.id, disponivel, disponivel)}
                        className="text-xs text-brand-blue hover:underline"
                      >
                        {disponivel} disponíve{disponivel === 1 ? 'l' : 'is'} · usar todas
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={disponivel}
                      value={quantidades[m.id] ?? 0}
                      onChange={(e) => definirQuantidade(m.id, disponivel, Number(e.target.value))}
                      className="w-16 shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm outline-none focus:border-brand-blue"
                    />
                  </div>
                )
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{totalSelecionado} questão{totalSelecionado !== 1 ? 'ões' : ''} selecionada{totalSelecionado !== 1 ? 's' : ''} no total</p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={usarTempo} onChange={(e) => setUsarTempo(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-blue" />
              Usar cronômetro com tempo limite
            </label>
            {usarTempo && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={tempoMinutos}
                  onChange={(e) => setTempoMinutos(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm outline-none focus:border-brand-blue"
                />
                <span className="text-sm text-slate-500">minutos</span>
              </div>
            )}
          </div>

          <Button onClick={iniciar} disabled={totalSelecionado === 0} className="w-full">
            <Play className="h-4 w-4" strokeWidth={2} />
            Iniciar simulado
          </Button>
        </Card>
      )}

      {historico === null ? null : historico.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Histórico de simulados</h2>
          <div className="space-y-2">
            {historico.map((s) => {
              const pct = s.totalQuestoes ? Math.round((s.acertos / s.totalQuestoes) * 100) : 0
              return (
                <Card key={s.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-navy">{s.nome}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(s.criadoEm).toLocaleString('pt-BR')} · {formatarTempo(s.duracaoSegundos)}
                        {s.tempoLimiteSegundos ? ` · limite de ${Math.round(s.tempoLimiteSegundos / 60)} min` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.materias.map((m) => (
                          <span key={m.materiaId} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {m.materiaNome} {m.acertos}/{m.quantidade}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`flex items-center gap-1 text-sm font-bold ${corPct(pct)}`}>
                        <Target className="h-3.5 w-3.5" strokeWidth={2} />
                        {s.acertos}/{s.totalQuestoes}
                      </span>
                      <button
                        type="button"
                        onClick={() => setParaExcluir(s)}
                        className="rounded-lg p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Excluir simulado"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!paraExcluir}
        title={`Excluir "${paraExcluir?.nome}"?`}
        description="Esse registro do histórico será excluído permanentemente. As respostas continuam contando no seu Desempenho geral."
        onConfirm={confirmarExclusaoHistorico}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  )
}
