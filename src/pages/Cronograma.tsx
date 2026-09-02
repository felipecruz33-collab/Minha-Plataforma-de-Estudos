import { ArrowRightLeft, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, Circle, PencilLine, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SeloOrigem } from '../components/ui/SeloOrigem'
import { gerarSemanasAutomatico, gerarSemanasManual } from '../lib/cronogramaGerador'
import { diasDaSemana, remanejarPendentes, tamanhoDaSemana } from '../lib/cronogramaSemana'
import { agruparPorOrigem, GRUPO_BIBLIOTECA, GRUPO_MINHAS, nomesDuplicados, rotuloDaMateria } from '../lib/materiasPorOrigem'
import { useAuth } from '../lib/auth/AuthContext'
import { podeVerBiblioteca as calcPodeVerBiblioteca } from '../lib/premium'
import { repo, type MateriaComContagem } from '../lib/repo'
import type { Aula, Cronograma, ItemCronograma, SemanaCronograma } from '../lib/types'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function semanaAtualDe(semanas: SemanaCronograma[]): number | null {
  const hoje = hojeISO()
  const atual = semanas.find((s) => s.inicioEm <= hoje && hoje <= s.fimEm)
  return atual?.numero ?? semanas[0]?.numero ?? null
}

export default function CronogramaPage() {
  const { user, perfil } = useAuth()
  const [materiasDisponiveis, setMateriasDisponiveis] = useState<MateriaComContagem[]>([])
  const [aulasPorMateria, setAulasPorMateria] = useState<Record<string, Aula[]>>({})
  const [cronograma, setCronograma] = useState<Cronograma | null | undefined>(undefined)
  const [mostrarForm, setMostrarForm] = useState(false)

  const [nome, setNome] = useState('Meu cronograma de estudos')
  const [modo, setModo] = useState<'automatico' | 'manual'>('automatico')
  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState(somarDias(hojeISO(), 90))
  const [materiasSelecionadas, setMateriasSelecionadas] = useState<Set<string>>(new Set())
  const [confirmarRecriar, setConfirmarRecriar] = useState(false)

  const [renomeando, setRenomeando] = useState(false)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const [semanaAberta, setSemanaAberta] = useState<number | null>(null)
  const [novoItem, setNovoItem] = useState<Record<number, { descricao: string; materiaId: string; dia: string }>>({})
  /** O que foi remanejado nesta visita — some quando a pessoa fecha. */
  const [avisoRemanejo, setAvisoRemanejo] = useState<{ movidas: number; origens: number[]; paraSemana: number } | null>(null)

  useEffect(() => {
    if (!user) return
    const podeVerBiblioteca = calcPodeVerBiblioteca(perfil)
    Promise.all([
      repo.listMaterias(user.id),
      podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([]),
      repo.getCronograma(user.id),
    ]).then(async ([minhas, biblio, cron]) => {
      const todas = [...minhas, ...biblio]
      setMateriasDisponiveis(todas)
      const mapa: Record<string, Aula[]> = {}
      for (const m of todas) mapa[m.id] = await repo.listAulas(m.id)
      setAulasPorMateria(mapa)
      // Tarefa não feita em semana que já acabou vem para a semana corrente.
      // Sem isto, o atraso ficava enterrado numa semana que ninguém reabre — e
      // o cronograma seguia mostrando "tudo certo" na semana de hoje.
      //
      // `remanejarPendentes` devolve `null` quando não há o que mover, e é por
      // isso que abrir o cronograma não vira uma escrita no banco a cada visita.
      const remanejo = cron ? remanejarPendentes(cron.semanas, hojeISO()) : null
      if (cron && remanejo) {
        const atualizado = { ...cron, semanas: remanejo.semanas }
        setCronograma(atualizado)
        setAvisoRemanejo({ movidas: remanejo.movidas, origens: remanejo.semanasDeOrigem, paraSemana: remanejo.paraSemana })
        setSemanaAberta(remanejo.paraSemana)
        await repo.upsertCronograma(user.id, {
          nome: cron.nome,
          modo: cron.modo,
          dataInicio: cron.dataInicio,
          dataFim: cron.dataFim,
          materias: cron.materias,
          semanas: remanejo.semanas,
        })
        return
      }
      setCronograma(cron)
      if (cron) setSemanaAberta(semanaAtualDe(cron.semanas))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  const { itensConcluidos, itensTotais, pctGeral } = useMemo(() => {
    const todos = cronograma?.semanas.flatMap((s) => s.itens) ?? []
    const feitos = todos.filter((i) => i.concluido).length
    return { itensConcluidos: feitos, itensTotais: todos.length, pctGeral: todos.length ? Math.round((feitos / todos.length) * 100) : 0 }
  }, [cronograma])

  function toggleMateria(materiaId: string) {
    setMateriasSelecionadas((s) => {
      const novo = new Set(s)
      if (novo.has(materiaId)) novo.delete(materiaId)
      else novo.add(materiaId)
      return novo
    })
  }

  async function gerar() {
    if (!user) return
    const materiasEscolhidas = materiasDisponiveis.filter((m) => materiasSelecionadas.has(m.id))
    const semanas =
      modo === 'automatico'
        ? gerarSemanasAutomatico(
            dataInicio,
            dataFim,
            materiasEscolhidas.map((m) => ({ materiaId: m.id, materiaNome: m.nome, aulas: (aulasPorMateria[m.id] ?? []).map((a) => ({ id: a.id, titulo: a.titulo })) })),
          )
        : gerarSemanasManual(dataInicio, dataFim)

    const salvo = await repo.upsertCronograma(user.id, {
      nome: nome.trim() || 'Meu cronograma de estudos',
      modo,
      dataInicio,
      dataFim,
      materias: modo === 'automatico' ? materiasEscolhidas.map((m) => ({ materiaId: m.id, materiaNome: m.nome })) : [],
      semanas,
    })
    setCronograma(salvo)
    setMostrarForm(false)
    setConfirmarRecriar(false)
    setSemanaAberta(semanaAtualDe(salvo.semanas))
  }

  function onSubmitForm() {
    if (cronograma) setConfirmarRecriar(true)
    else gerar()
  }

  async function salvarSemanas(semanas: SemanaCronograma[]) {
    if (!user || !cronograma) return
    const atualizado = { ...cronograma, semanas }
    setCronograma(atualizado)
    await repo.upsertCronograma(user.id, {
      nome: cronograma.nome,
      modo: cronograma.modo,
      dataInicio: cronograma.dataInicio,
      dataFim: cronograma.dataFim,
      materias: cronograma.materias,
      semanas,
    })
  }

  function toggleItem(semanaNumero: number, itemId: string) {
    if (!cronograma) return
    salvarSemanas(
      cronograma.semanas.map((s) =>
        s.numero !== semanaNumero ? s : { ...s, itens: s.itens.map((it) => (it.id === itemId ? { ...it, concluido: !it.concluido } : it)) },
      ),
    )
  }

  function removerItem(semanaNumero: number, itemId: string) {
    if (!cronograma) return
    salvarSemanas(cronograma.semanas.map((s) => (s.numero !== semanaNumero ? s : { ...s, itens: s.itens.filter((it) => it.id !== itemId) })))
  }

  function adicionarItem(semanaNumero: number) {
    if (!cronograma) return
    const rascunho = novoItem[semanaNumero]
    const descricao = rascunho?.descricao.trim()
    if (!descricao) return
    const materiaId = rascunho.materiaId || null
    const materiaNome = materiaId ? (materiasDisponiveis.find((m) => m.id === materiaId)?.nome ?? '') : ''
    const dia = rascunho.dia === '' ? null : Number(rascunho.dia)
    const novo: ItemCronograma = { id: crypto.randomUUID(), materiaId, materiaNome, aulaId: null, descricao, concluido: false, dia }
    salvarSemanas(cronograma.semanas.map((s) => (s.numero !== semanaNumero ? s : { ...s, itens: [...s.itens, novo] })))
    setNovoItem((n) => ({ ...n, [semanaNumero]: { descricao: '', materiaId: '', dia: n[semanaNumero]?.dia ?? '' } }))
  }

  /** Troca a tarefa de dia dentro da mesma semana. */
  function moverParaDia(semanaNumero: number, itemId: string, dia: number | null) {
    if (!cronograma) return
    salvarSemanas(
      cronograma.semanas.map((s) =>
        s.numero !== semanaNumero ? s : { ...s, itens: s.itens.map((it) => (it.id === itemId ? { ...it, dia } : it)) },
      ),
    )
  }

  async function renomear() {
    if (!user || !cronograma) return
    const novoNome = nomeEdicao.trim()
    setRenomeando(false)
    if (!novoNome || novoNome === cronograma.nome) return
    const atualizado = { ...cronograma, nome: novoNome }
    setCronograma(atualizado)
    await repo.upsertCronograma(user.id, {
      nome: novoNome,
      modo: cronograma.modo,
      dataInicio: cronograma.dataInicio,
      dataFim: cronograma.dataFim,
      materias: cronograma.materias,
      semanas: cronograma.semanas,
    })
  }

  async function excluir() {
    if (!user) return
    await repo.deleteCronograma(user.id)
    setCronograma(null)
    setConfirmarExcluir(false)
  }

  function abrirRecriar() {
    if (!cronograma) return
    setNome(cronograma.nome)
    setModo(cronograma.modo)
    setDataInicio(cronograma.dataInicio)
    setDataFim(cronograma.dataFim)
    setMateriasSelecionadas(new Set(cronograma.materias.map((m) => m.materiaId)))
    setMostrarForm(true)
  }

  /** Nomes que existem nas suas matérias E na biblioteca — os que precisam de carimbo. */
  const nomesAmbiguos = nomesDuplicados(materiasDisponiveis)
  const { minhas: minhasMaterias, biblioteca: materiasDaBiblioteca } = agruparPorOrigem(materiasDisponiveis)

  const rangeInvalido = dataFim <= dataInicio
  const semMateriaAuto = modo === 'automatico' && materiasSelecionadas.size === 0

  return (
    <div className="max-w-lg space-y-4">
      {cronograma === undefined ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : cronograma === null || mostrarForm ? (
        <Card className="space-y-4">
          <div>
            <h1 className="mb-1 flex items-center gap-2 text-base font-bold text-navy">
              <CalendarDays className="h-5 w-5 text-brand-blue" strokeWidth={1.75} />
              {cronograma ? 'Gerar cronograma novamente' : 'Criar cronograma de estudos'}
            </h1>
            <p className="text-sm text-slate-400">
              Defina o prazo e deixe a IA da casa organizar as semanas — ou monte tudo manualmente, semana a semana, do seu jeito.
            </p>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nome do cronograma</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo('automatico')}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-center transition-colors ${
                modo === 'automatico' ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Sparkles className={`h-5 w-5 ${modo === 'automatico' ? 'text-brand-blue' : 'text-slate-400'}`} strokeWidth={1.75} />
              <span className="text-sm font-semibold text-navy">Automático</span>
            </button>
            <button
              type="button"
              onClick={() => setModo('manual')}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-center transition-colors ${
                modo === 'manual' ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <PencilLine className={`h-5 w-5 ${modo === 'manual' ? 'text-brand-blue' : 'text-slate-400'}`} strokeWidth={1.75} />
              <span className="text-sm font-semibold text-navy">Manual</span>
            </button>
          </div>
          <p className="-mt-2 text-xs text-slate-400">
            {modo === 'automatico'
              ? 'Escolha as matérias e o prazo — as aulas são distribuídas pelas semanas automaticamente, com uma semana de revisão geral no final.'
              : 'As semanas ficam vazias — você preenche o que vai estudar em cada uma, semana a semana, no seu ritmo.'}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Início</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Prazo final</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
              />
            </label>
          </div>
          {rangeInvalido && <p className="text-xs text-rose-500">O prazo final precisa ser depois da data de início.</p>}

          {modo === 'automatico' && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Matérias a incluir</span>
              {materiasDisponiveis.length === 0 ? (
                <p className="text-xs text-slate-400">Você ainda não tem matérias — crie uma em "Adicionar conteúdo" primeiro.</p>
              ) : (
                <div className="space-y-3">
                  {/* Suas matérias e as da biblioteca em blocos separados: é
                      comum as duas terem o mesmo nome, e numa lista só a pessoa
                      marca no escuro qual está incluindo no plano. */}
                  {[
                    { titulo: GRUPO_MINHAS, itens: minhasMaterias },
                    { titulo: GRUPO_BIBLIOTECA, itens: materiasDaBiblioteca },
                  ]
                    .filter((sec) => sec.itens.length > 0)
                    .map((sec, _i, secoes) => (
                      <div key={sec.titulo}>
                        {secoes.length > 1 && (
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{sec.titulo}</p>
                        )}
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {sec.itens.map((m) => {
                    const aulasCount = aulasPorMateria[m.id]?.length ?? 0
                    return (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={materiasSelecionadas.has(m.id)}
                          onChange={() => toggleMateria(m.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-blue"
                        />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <span className="truncate">{m.nome}</span>
                            {nomesAmbiguos.has(m.nome) && <SeloOrigem isBiblioteca={m.isBiblioteca} />}
                          </p>
                          <p className="text-xs text-slate-400">
                            {aulasCount} aula{aulasCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {cronograma && (
              <Button variant="secondary" onClick={() => setMostrarForm(false)} className="flex-1">
                Cancelar
              </Button>
            )}
            <Button onClick={onSubmitForm} disabled={rangeInvalido || semMateriaAuto} className="flex-1">
              {cronograma ? 'Gerar novamente' : 'Criar cronograma'}
            </Button>
          </div>

          <ConfirmDialog
            open={confirmarRecriar}
            title="Gerar o cronograma de novo?"
            description='Isso substitui todas as semanas atuais pela nova configuração — tarefas e marcações de "feito" que já existem serão perdidas.'
            confirmLabel="Gerar novamente"
            onConfirm={gerar}
            onCancel={() => setConfirmarRecriar(false)}
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {renomeando ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={nomeEdicao}
                      onChange={(e) => setNomeEdicao(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renomear()
                        if (e.key === 'Escape') setRenomeando(false)
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-base font-bold outline-none focus:border-brand-blue"
                    />
                    <button type="button" onClick={renomear} className="shrink-0 rounded p-1 text-emerald-500 hover:bg-emerald-50" aria-label="Salvar nome">
                      <Check className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button type="button" onClick={() => setRenomeando(false)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cancelar">
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h1 className="truncate text-lg font-bold text-navy">{cronograma.nome}</h1>
                    <button
                      type="button"
                      onClick={() => {
                        setNomeEdicao(cronograma.nome)
                        setRenomeando(true)
                      }}
                      className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                      aria-label="Renomear cronograma"
                    >
                      <PencilLine className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-400">
                  {formatarDataBr(cronograma.dataInicio)} – {formatarDataBr(cronograma.dataFim)} ·{' '}
                  {cronograma.modo === 'automatico' ? 'gerado automaticamente' : 'manual'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={abrirRecriar}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy"
                  aria-label="Gerar novamente"
                  title="Gerar novamente"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarExcluir(true)}
                  className="rounded-lg p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Excluir cronograma"
                  title="Excluir cronograma"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span>Progresso geral</span>
                <span>
                  {itensConcluidos}/{itensTotais} ({pctGeral}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-gradient transition-all" style={{ width: `${pctGeral}%` }} />
              </div>
            </div>
          </Card>

          {/* O remanejamento precisa ser VISÍVEL. Um app que reorganiza a
              semana da pessoa em silêncio é um app em que ela para de confiar
              — ela lembra de ter deixado a tarefa na semana 2. */}
          {avisoRemanejo && (
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-start gap-2.5">
                <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    {avisoRemanejo.movidas === 1
                      ? '1 tarefa que ficou para trás veio para esta semana.'
                      : `${avisoRemanejo.movidas} tarefas que ficaram para trás vieram para esta semana.`}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    {avisoRemanejo.origens.length === 1
                      ? `Estava em aberto na semana ${avisoRemanejo.origens[0]}.`
                      : `Estavam em aberto nas semanas ${avisoRemanejo.origens.join(', ')}.`}{' '}
                    Chegaram sem dia marcado — escolha quando encaixar cada uma.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAvisoRemanejo(null)}
                  className="shrink-0 rounded p-1 text-amber-500 hover:bg-amber-100"
                  aria-label="Fechar aviso"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {cronograma.semanas.map((semana) => {
              const total = semana.itens.length
              const feitos = semana.itens.filter((i) => i.concluido).length
              const hoje = hojeISO()
              const ehAtual = semana.inicioEm <= hoje && hoje <= semana.fimEm
              const aberta = semanaAberta === semana.numero
              return (
                <Card key={semana.numero} className={ehAtual ? 'border-brand-blue ring-1 ring-brand-blue/20' : ''}>
                  <button
                    type="button"
                    onClick={() => setSemanaAberta(aberta ? null : semana.numero)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-bold text-navy">
                        Semana {semana.numero}
                        {ehAtual && <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-semibold text-brand-blue">Atual</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatarDataBr(semana.inicioEm)} – {formatarDataBr(semana.fimEm)}
                        {total > 0 && ` · ${feitos}/${total}`}
                      </p>
                    </div>
                    {aberta ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                    )}
                  </button>

                  {aberta && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {semana.itens.length === 0 && <p className="mb-2 text-xs text-slate-400">Nenhuma tarefa nessa semana ainda — adicione abaixo.</p>}

                      {/* A semana projetada dia a dia. Dia vazio continua
                          aparecendo: é ele que mostra onde ainda cabe coisa. */}
                      {(() => {
                        const { dias, semDia } = diasDaSemana(semana, hoje)
                        const linha = (item: ItemCronograma) => (
                          <div key={item.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-slate-50">
                            <button
                              type="button"
                              onClick={() => toggleItem(semana.numero, item.id)}
                              className="mt-0.5 shrink-0"
                              aria-label={item.concluido ? 'Marcar como não feito' : 'Marcar como feito'}
                            >
                              {item.concluido ? (
                                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" strokeWidth={1.75} />
                              ) : (
                                <Circle className="h-[18px] w-[18px] text-slate-300" strokeWidth={1.75} />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${item.concluido ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.descricao}</p>
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                                {item.materiaNome && <span>{item.materiaNome}</span>}
                                {/* Duas matérias com o mesmo nome deixariam a
                                    tarefa ambígua depois de criada — o carimbo
                                    sai do `materiaId`, que é o dado confiável. */}
                                {item.materiaNome && nomesAmbiguos.has(item.materiaNome) && (
                                  <SeloOrigem
                                    isBiblioteca={!!materiasDisponiveis.find((m) => m.id === item.materiaId)?.isBiblioteca}
                                  />
                                )}
                                {item.veioDaSemana !== undefined && (
                                  <span className="flex items-center gap-1 font-medium text-amber-600">
                                    <ArrowRightLeft className="h-3 w-3" strokeWidth={2} />
                                    veio da semana {item.veioDaSemana}
                                  </span>
                                )}
                              </span>
                            </div>
                            <select
                              value={typeof item.dia === 'number' ? String(item.dia) : ''}
                              onChange={(e) => moverParaDia(semana.numero, item.id, e.target.value === '' ? null : Number(e.target.value))}
                              className="shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-500 outline-none focus:border-brand-blue"
                              aria-label="Mudar o dia da tarefa"
                            >
                              <option value="">Sem dia</option>
                              {dias.map((d) => (
                                <option key={d.indice} value={d.indice}>
                                  {d.rotulo}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removerItem(semana.numero, item.id)}
                              className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                              aria-label="Remover tarefa"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          </div>
                        )
                        return (
                          <>
                            {semDia.length > 0 && (
                              <div className="mb-3 rounded-lg bg-amber-50/60 p-2">
                                <p className="mb-1 px-1.5 text-xs font-bold text-amber-700">
                                  Sem dia marcado ({semDia.length}) — escolha quando encaixar
                                </p>
                                {semDia.map(linha)}
                              </div>
                            )}
                            {dias.map((d) => (
                              <div key={d.indice} className="mb-1.5">
                                <p
                                  className={`px-1.5 text-xs font-bold ${
                                    d.ehHoje ? 'text-brand-blue' : d.ehPassado ? 'text-slate-300' : 'text-slate-400'
                                  }`}
                                >
                                  {d.rotulo}
                                  {d.ehHoje && <span className="ml-1.5 font-semibold">· hoje</span>}
                                </p>
                                {d.itens.length === 0 ? (
                                  <p className="px-1.5 py-1 text-xs text-slate-300">livre</p>
                                ) : (
                                  d.itens.map(linha)
                                )}
                              </div>
                            ))}
                          </>
                        )
                      })()}

                      <div className="flex items-center gap-1.5 pt-1.5">
                        <input
                          type="text"
                          placeholder="Adicionar tarefa…"
                          value={novoItem[semana.numero]?.descricao ?? ''}
                          onChange={(e) =>
                            setNovoItem((n) => ({
                              ...n,
                              [semana.numero]: { ...(n[semana.numero] ?? { materiaId: '', dia: '' }), descricao: e.target.value },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') adicionarItem(semana.numero)
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-blue"
                        />
                        <select
                          value={novoItem[semana.numero]?.dia ?? ''}
                          onChange={(e) =>
                            setNovoItem((n) => ({
                              ...n,
                              [semana.numero]: { ...(n[semana.numero] ?? { descricao: '', materiaId: '' }), dia: e.target.value },
                            }))
                          }
                          className="shrink-0 rounded-lg border border-slate-300 px-1.5 py-1.5 text-xs outline-none focus:border-brand-blue"
                          aria-label="Dia da tarefa"
                        >
                          <option value="">Sem dia</option>
                          {Array.from({ length: tamanhoDaSemana(semana) }, (_, i) => (
                            <option key={i} value={i}>
                              {diasDaSemana(semana, hoje).dias[i].rotulo}
                            </option>
                          ))}
                        </select>
                        <select
                          value={novoItem[semana.numero]?.materiaId ?? ''}
                          onChange={(e) =>
                            setNovoItem((n) => ({
                              ...n,
                              [semana.numero]: { ...(n[semana.numero] ?? { descricao: '', dia: '' }), materiaId: e.target.value },
                            }))
                          }
                          className="shrink-0 rounded-lg border border-slate-300 px-1.5 py-1.5 text-xs outline-none focus:border-brand-blue"
                        >
                          <option value="">Geral</option>
                          {/* `optgroup` é a forma nativa de separar num select
                              — e continua funcionando no seletor do celular,
                              que é onde isso mais confunde. */}
                          {minhasMaterias.length > 0 && (
                            <optgroup label={GRUPO_MINHAS}>
                              {minhasMaterias.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {rotuloDaMateria(m, nomesAmbiguos)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {materiasDaBiblioteca.length > 0 && (
                            <optgroup label={GRUPO_BIBLIOTECA}>
                              {materiasDaBiblioteca.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {rotuloDaMateria(m, nomesAmbiguos)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => adicionarItem(semana.numero)}
                          className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"
                          aria-label="Adicionar tarefa"
                        >
                          <Plus className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmarExcluir}
        title="Excluir este cronograma?"
        description="Todas as semanas e tarefas marcadas serão excluídas permanentemente. Você pode criar um novo cronograma depois."
        onConfirm={excluir}
        onCancel={() => setConfirmarExcluir(false)}
      />
    </div>
  )
}
