import { BookMarked, Clock, ListChecks, Play, RotateCcw, Search, Sparkles, Target, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { SeloOrigem } from '../components/ui/SeloOrigem'
import { useAuth } from '../lib/auth/AuthContext'
import { contemTodasAsPalavras } from '../lib/buscarTexto'
import { montarCadernoMensal, ROTULO_NIVEL, type CadernoMensal } from '../lib/cadernoMensal'
import { agruparPorOrigem, GRUPO_BIBLIOTECA, GRUPO_MINHAS, nomesDuplicados } from '../lib/materiasPorOrigem'
import { podeVerBiblioteca as calcPodeVerBiblioteca } from '../lib/premium'
import { repo, type AulaComQuestoes, type MateriaComContagem } from '../lib/repo'
import type { Questao, Resposta, Simulado, SimuladoMateria } from '../lib/types'

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
  const [aulas, setAulas] = useState<AulaComQuestoes[]>([])
  const [busca, setBusca] = useState('')
  const [historico, setHistorico] = useState<Simulado[] | null>(null)
  const [respostas, setRespostas] = useState<Resposta[]>([])
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

  const caderno = useMemo(() => {
    const questoes = aulas.flatMap((a) => a.questoes)
    return montarCadernoMensal({ questoes, respostas })
  }, [aulas, respostas])

  /** Manda o caderno do mês direto pro mesmo motor que roda os simulados. */
  function iniciarCaderno(cad: CadernoMensal) {
    const porMateria = new Map<string, { materiaNome: string; quantidade: number }>()
    for (const q of cad.questoes) {
      const nomeMateria = materias.find((m) => m.id === q.materiaId)?.nome ?? 'Matéria'
      const atual = porMateria.get(q.materiaId)
      if (atual) atual.quantidade += 1
      else porMateria.set(q.materiaId, { materiaNome: nomeMateria, quantidade: 1 })
    }
    setConfig({
      nome: `${cad.rotulo} · ${ROTULO_NIVEL[cad.nivel.nivel]}`,
      materias: Array.from(porMateria, ([materiaId, v]) => ({ materiaId, ...v })),
      tempoLimiteSegundos: null,
    })
    // Já vem embaralhado e estável no mês — reembaralhar aqui quebraria isso.
    setRodada(cad.questoes)
    setRespostasStatus({})
    setSalvo(false)
    const agoraMs = Date.now()
    setInicioEm(agoraMs)
    setAgora(agoraMs)
  }

  function carregarHistorico() {
    if (!user) return
    repo.listSimulados(user.id).then(setHistorico)
    // O caderno do mês sai daqui: é o histórico de respostas que diz o nível
    // e separa o que é revisão, reforço e inédito.
    repo.listRespostas(user.id).then(setRespostas)
  }

  useEffect(() => {
    if (!user) return
    const podeVerBiblioteca = calcPodeVerBiblioteca(perfil)
    Promise.all([repo.listMaterias(user.id), podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([])]).then(
      async ([minhas, biblio]) => {
        const todas = [...minhas, ...biblio]
        setMaterias(todas)
        // Uma consulta só. Antes era um `await` por matéria dentro de um laço:
        // com 12 matérias, 12 idas ao servidor uma DEPOIS da outra.
        setAulas(await repo.listAulasComQuestoes(todas.map((m) => m.id)))
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

  /**
   * As matérias que têm questões, cada uma com as aulas que têm questões.
   *
   * A escolha passou a ser POR AULA, e não por matéria: um simulado de
   * "Português" sorteado do bolo inteiro quase nunca é o que a pessoa quer —
   * quem está estudando crase quer as questões de crase, não uma amostra
   * aleatória de tudo que já importou naquela matéria.
   */
  const grupos = useMemo(() => {
    const porMateria = new Map<string, AulaComQuestoes[]>()
    for (const a of aulas) {
      if (a.questoes.length === 0) continue
      const lista = porMateria.get(a.materiaId)
      if (lista) lista.push(a)
      else porMateria.set(a.materiaId, [a])
    }
    return materias
      .map((m) => ({ materia: m, aulas: porMateria.get(m.id) ?? [] }))
      .filter((g) => g.aulas.length > 0)
  }, [materias, aulas])

  /**
   * A busca filtra por nome de matéria E de aula.
   *
   * Com a escolha por aula, a lista deixou de ter uma linha por matéria e
   * passou a ter uma por aula — dezenas, às vezes centenas. Sem uma forma de
   * chegar direto ao que se quer, a granularidade nova atrapalharia mais do
   * que ajuda. Uma matéria cujo NOME casa com a busca aparece inteira; do
   * contrário, aparece só com as aulas que casam.
   */
  const gruposVisiveis = useMemo(() => {
    const termo = busca.trim()
    if (!termo) return grupos
    return grupos
      .map((g) => {
        if (contemTodasAsPalavras(g.materia.nome, termo)) return g
        return { ...g, aulas: g.aulas.filter((a) => contemTodasAsPalavras(`${g.materia.nome} ${a.titulo}`, termo)) }
      })
      .filter((g) => g.aulas.length > 0)
  }, [grupos, busca])

  const totalSelecionado = useMemo(() => Object.values(quantidades).reduce((a, b) => a + b, 0), [quantidades])

  /** Quanto já foi escolhido dentro de uma matéria — mostrado no cabeçalho dela. */
  function selecionadoNaMateria(g: { aulas: AulaComQuestoes[] }): number {
    return g.aulas.reduce((n, a) => n + (quantidades[a.id] ?? 0), 0)
  }

  function definirQuantidade(aulaId: string, disponivel: number, valor: number) {
    const limitado = Math.max(0, Math.min(disponivel, Math.floor(valor) || 0))
    setQuantidades((q) => ({ ...q, [aulaId]: limitado }))
  }

  /** Marca (ou desmarca) todas as aulas visíveis de uma matéria de uma vez. */
  function definirMateriaInteira(g: { aulas: AulaComQuestoes[] }, tudo: boolean) {
    setQuantidades((q) => {
      const novo = { ...q }
      for (const a of g.aulas) novo[a.id] = tudo ? a.questoes.length : 0
      return novo
    })
  }

  function iniciar() {
    // O sorteio é por aula; o histórico continua sendo por matéria, então as
    // aulas escolhidas são somadas de volta na matéria a que pertencem.
    const porMateria = new Map<string, { materiaNome: string; quantidade: number }>()
    const banco: Questao[] = []

    for (const g of grupos) {
      for (const a of g.aulas) {
        const quantidade = quantidades[a.id] ?? 0
        if (quantidade <= 0) continue
        banco.push(...embaralhar(a.questoes).slice(0, quantidade))
        const atual = porMateria.get(g.materia.id)
        if (atual) atual.quantidade += quantidade
        else porMateria.set(g.materia.id, { materiaNome: g.materia.nome, quantidade })
      }
    }

    const materiasEscolhidas = Array.from(porMateria, ([materiaId, v]) => ({ materiaId, ...v }))

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
      {caderno && (
        <Card className="space-y-3 border-brand-blue/30 bg-blue-50/40">
          <div className="flex items-start gap-2.5">
            <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                {caderno.rotulo}
                <span className="rounded-full bg-brand-blue px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  {ROTULO_NIVEL[caderno.nivel.nivel]}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {caderno.nivel.base === 'inicio' ? (
                  <>
                    Você ainda tem pouco histórico, então o caderno começa no nível iniciante. Ele sobe sozinho conforme
                    você responde.
                  </>
                ) : (
                  <>
                    Seu nível vem de {caderno.nivel.pct}% de aproveitamento em {caderno.nivel.consideradas} questões
                    {caderno.nivel.base === 'recente' ? ' nos últimos 30 dias' : ' no seu histórico'}.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* A composição fica à mostra: é ela que muda de nível pra nível, e
              esconder isso faria o caderno parecer um sorteio qualquer. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              <strong className="text-navy">{caderno.questoes.length}</strong> questões
            </span>
            {caderno.composicao.revisao > 0 && (
              <span>
                <strong className="text-rose-600">{caderno.composicao.revisao}</strong> para recuperar
              </span>
            )}
            {caderno.composicao.ineditas > 0 && (
              <span>
                <strong className="text-brand-blue">{caderno.composicao.ineditas}</strong> inéditas
              </span>
            )}
            {caderno.composicao.reforco > 0 && (
              <span>
                <strong className="text-emerald-600">{caderno.composicao.reforco}</strong> de reforço
              </span>
            )}
          </div>

          <Button onClick={() => iniciarCaderno(caderno)} className="w-full">
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            Começar o caderno do mês
          </Button>
          <p className="text-[11px] text-slate-400">
            O caderno é o mesmo o mês inteiro — dá para parar e voltar. No mês que vem ele é remontado com o nível que
            você tiver então.
          </p>
        </Card>
      )}

      {grupos.length === 0 ? (
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
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Quantas questões de cada aula</span>

            <label className="mb-2 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-brand-blue">
              <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar matéria ou aula…"
                className="w-full text-sm outline-none"
              />
            </label>

            {gruposVisiveis.length === 0 ? (
              <p className="rounded-lg border border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
                Nada encontrado para "{busca.trim()}".
              </p>
            ) : (
              <div className="space-y-4">
                {(() => {
                  // As suas matérias e as da biblioteca em seções separadas. É
                  // comum ter as duas com o mesmo nome — numa lista só, viram a
                  // mesma linha e a escolha é no escuro.
                  const { minhas, biblioteca } = agruparPorOrigem(gruposVisiveis.map((g) => ({ ...g, isBiblioteca: g.materia.isBiblioteca })))
                  const duplicados = nomesDuplicados(gruposVisiveis.map((g) => g.materia))
                  const secoes = [
                    { titulo: GRUPO_MINHAS, itens: minhas },
                    { titulo: GRUPO_BIBLIOTECA, itens: biblioteca },
                  ].filter((sec) => sec.itens.length > 0)
                  return secoes.map((sec) => (
                    <div key={sec.titulo}>
                      {/* O título da seção só aparece quando existem os dois
                          lados; com um só, ele não separa nada. */}
                      {secoes.length > 1 && (
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{sec.titulo}</p>
                      )}
                      <div className="space-y-2">
                        {sec.itens.map((g) => {
                  const escolhidasAqui = selecionadoNaMateria(g)
                  const disponivelNaMateria = g.aulas.reduce((n, a) => n + a.questoes.length, 0)
                  return (
                    <div key={g.materia.id} className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                            <span className="truncate">{g.materia.nome}</span>
                            {/* Mesmo dentro da seção, o carimbo fica quando o
                                nome existe dos dois lados: numa tela rolada, o
                                título da seção pode não estar à vista. */}
                            {duplicados.has(g.materia.nome) && <SeloOrigem isBiblioteca={g.materia.isBiblioteca} />}
                          </p>
                          <p className="text-xs text-slate-400">
                            {escolhidasAqui} de {disponivelNaMateria} selecionadas
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => definirMateriaInteira(g, escolhidasAqui !== disponivelNaMateria)}
                          className="shrink-0 text-xs font-medium text-brand-blue hover:underline"
                        >
                          {escolhidasAqui === disponivelNaMateria ? 'limpar' : 'usar todas'}
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {g.aulas.map((a) => {
                          const disponivel = a.questoes.length
                          return (
                            <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-slate-700">{a.titulo}</p>
                                <button
                                  type="button"
                                  onClick={() => definirQuantidade(a.id, disponivel, disponivel)}
                                  className="text-xs text-slate-400 hover:text-brand-blue hover:underline"
                                >
                                  {disponivel} disponíve{disponivel === 1 ? 'l' : 'is'}
                                </button>
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={disponivel}
                                value={quantidades[a.id] ?? 0}
                                onChange={(e) => definirQuantidade(a.id, disponivel, Number(e.target.value))}
                                className="w-16 shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm outline-none focus:border-brand-blue"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                        })}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}

            <p className="mt-1.5 text-xs text-slate-400">
              {/* A palavra inteira muda no plural ("questão" -> "questões"),
                  então não dá pra só grudar um sufixo: virava "questãoões". */}
              {totalSelecionado} {totalSelecionado === 1 ? 'questão selecionada' : 'questões selecionadas'} no total
              {busca.trim() && ' (a busca só esconde a lista — o que já foi escolhido continua valendo)'}
            </p>
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
