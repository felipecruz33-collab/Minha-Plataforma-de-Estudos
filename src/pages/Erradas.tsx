import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { CarregarMais } from '../components/ui/CarregarMais'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabs } from '../components/ui/Tabs'
import { useAuth } from '../lib/auth/AuthContext'
import { useFiltroMateriaAula } from '../lib/hooks/useFiltroMateriaAula'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import { estadosDeRevisao, textoDoPrazo, type EstadoRevisao } from '../lib/revisaoEspacada'
import type { Resposta } from '../lib/types'

const selectCls = 'rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-blue'

/** Etiqueta do prazo, acima do cartão — vermelha quando já passou da hora. */
function Prazo({ estado }: { estado: EstadoRevisao }) {
  const atrasada = estado.diasAteVoltar < 0
  const hoje = estado.diasAteVoltar === 0
  const cor = atrasada ? 'text-rose-600' : hoje ? 'text-amber-600' : 'text-slate-400'
  return (
    <p className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${cor}`}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      {textoDoPrazo(estado)}
      {estado.acertosSeguidos > 0 && (
        <span className="text-slate-400">
          · {estado.acertosSeguidos} {estado.acertosSeguidos === 1 ? 'acerto seguido' : 'acertos seguidos'}
        </span>
      )}
      {estado.dominada && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">dominada</span>}
    </p>
  )
}

export default function Erradas() {
  const { user } = useAuth()
  const { questaoPorId, materias, aulas, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)
  // `null` = ninguém escolheu ainda, então a aba segue os dados. Abrir sempre
  // em "hoje" mostraria uma tela vazia justamente pra quem acabou de errar uma
  // questão — o prazo dela é amanhã. Depois do primeiro clique, a escolha da
  // pessoa manda.
  const [aba, setAba] = useState<'hoje' | 'todas' | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  const filtro = useFiltroMateriaAula(materias, aulas)

  // Calculado antes de qualquer saída antecipada: um hook não pode ficar
  // depois de um `return`, e o `useMemo` é o que dá à lista uma identidade
  // estável — sem ela o "carregar mais" nunca sairia da primeira página.
  const estados = useMemo(() => estadosDeRevisao(respostas ?? []), [respostas])

  const todasErradas = useMemo(() => {
    if (!respostas) return []
    const ultimaPorQuestao = new Map<string, Resposta>()
    for (const r of respostas) {
      const atual = ultimaPorQuestao.get(r.questaoId)
      if (!atual || r.respondidoEm > atual.respondidoEm) ultimaPorQuestao.set(r.questaoId, r)
    }
    return Array.from(ultimaPorQuestao.values())
      .filter((r) => !r.correta)
      .map((r) => questaoPorId.get(r.questaoId))
      .filter((q): q is NonNullable<typeof q> => !!q)
  }, [respostas, questaoPorId])

  /**
   * A fila de hoje.
   *
   * Não é a mesma coisa que "as erradas": uma questão que você errou e depois
   * acertou some da lista de erradas, mas continua no ciclo — e volta no
   * prazo, que é justamente o ponto. Por isso esta lista sai dos ESTADOS, não
   * das últimas respostas.
   */
  const paraHoje = useMemo(
    () =>
      Array.from(estados.values())
        .filter((e) => e.vencida)
        .sort((a, b) => a.diasAteVoltar - b.diasAteVoltar)
        .map((e) => questaoPorId.get(e.questaoId))
        .filter((q): q is NonNullable<typeof q> => !!q),
    [estados, questaoPorId],
  )

  const abaAtiva = aba ?? (paraHoje.length > 0 ? 'hoje' : 'todas')
  const base = abaAtiva === 'hoje' ? paraHoje : todasErradas
  const lista = useMemo(() => base.filter((q) => filtro.combina(q)), [base, filtro.materiaId, filtro.aulaId])

  const { visiveis, total, temMais, verMais } = useListaVisivel(lista)

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (todasErradas.length === 0 && estados.size === 0) {
    return (
      <EmptyState
        icon={XCircle}
        title="Nenhuma questão errada por aqui"
        description="Continue assim! Quando você errar uma questão ela entra num ciclo de revisão: volta amanhã, depois em 3 dias, 7, 21 e 60 — cada vez que você acerta, ela demora mais para voltar."
      />
    )
  }

  return (
    <div>
      <div className="mb-4">
        <Tabs
          tabs={[
            { key: 'hoje', label: `Para revisar hoje (${paraHoje.length})` },
            { key: 'todas', label: `Todas as erradas (${todasErradas.length})` },
          ]}
          active={abaAtiva}
          onChange={(k) => setAba(k as 'hoje' | 'todas')}
        />
      </div>

      <p className="mb-3 text-sm text-slate-500">
        {abaAtiva === 'hoje' ? (
          <>
            Questão errada volta <strong className="text-navy">amanhã</strong>; a cada acerto seguido o intervalo cresce
            para 3, 7, 21 e 60 dias. Estas já passaram da hora.
          </>
        ) : (
          <>
            Todas as questões cuja <strong className="text-navy">última resposta</strong> foi errada
            {lista.length !== todasErradas.length && (
              <>
                {' · '}
                <span className="font-semibold text-navy">{lista.length}</span> nesta seleção
              </>
            )}
            .
          </>
        )}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={filtro.materiaId} onChange={(e) => filtro.setMateriaId(e.target.value)} className={selectCls}>
          <option value="">Todas as matérias</option>
          {filtro.opcoesMateria.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>

        <select
          value={filtro.aulaId}
          onChange={(e) => filtro.setAulaId(e.target.value)}
          disabled={!filtro.materiaId}
          className={`${selectCls} disabled:bg-slate-50 disabled:text-slate-400`}
        >
          <option value="">{filtro.materiaId ? 'Todas as aulas' : 'Escolha a matéria'}</option>
          {filtro.opcoesAula.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titulo}
            </option>
          ))}
        </select>
      </div>

      {lista.length === 0 ? (
        abaAtiva === 'hoje' ? (
          <EmptyState
            icon={CheckCircle2}
            title="Revisão de hoje em dia"
            description="Nenhuma questão venceu o prazo. As que você errou voltam sozinhas quando chegar a hora — pode conferir a aba ao lado para ver a lista inteira."
          />
        ) : (
          <EmptyState
            icon={XCircle}
            title="Nenhuma questão errada nesta seleção"
            description="Você não errou nada nesta matéria ou aula — ou ainda não respondeu questões dela."
          />
        )
      ) : (
        <div className="space-y-3">
          {visiveis.map((q) => {
            const estado = estados.get(q.id)
            return (
              <div key={q.id}>
                {estado && <Prazo estado={estado} />}
                <QuestionCard questao={q} />
              </div>
            )
          })}
          <CarregarMais mostrando={visiveis.length} total={total} temMais={temMais} onVerMais={verMais} />
        </div>
      )}
    </div>
  )
}
