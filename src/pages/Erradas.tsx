import { AlertTriangle, Brain, CalendarClock, CheckCircle2, Clock, Dices, Shuffle, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ControleDaRevisao } from '../components/ControleDaRevisao'
import { QuestionCard } from '../components/QuestionCard'
import { CarregarMais } from '../components/ui/CarregarMais'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabs } from '../components/ui/Tabs'
import { useAuth } from '../lib/auth/AuthContext'
import { assuntosFracos, questoesEmFlashcard } from '../lib/flashcards'
import { intercalarPorAssunto } from '../lib/intercalar'
import { planoDoDia } from '../lib/sessaoDoDia'
import { useFiltroMateriaAula } from '../lib/hooks/useFiltroMateriaAula'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import { estadosDeRevisao, textoDoPrazo, vencidasPrimeiro, type EstadoRevisao } from '../lib/revisaoEspacada'
import type { Resposta } from '../lib/types'

const selectCls = 'min-w-0 max-w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-blue'

/** Etiqueta do prazo, acima do cartão — vermelha quando já passou da hora. */
function Prazo({ estado }: { estado: EstadoRevisao }) {
  const atrasada = !estado.pausada && estado.diasAteVoltar < 0
  const hoje = !estado.pausada && estado.diasAteVoltar === 0
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
      {estado.erroComCerteza && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
          <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          errou com certeza — prioridade
        </span>
      )}
      {estado.acertosChutados > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-500"
          title="Acerto marcado como chute não aumenta o prazo: sorte não é memória."
        >
          <Dices className="h-3 w-3 shrink-0" strokeWidth={2} />
          {estado.acertosChutados} {estado.acertosChutados === 1 ? 'acerto chutado' : 'acertos chutados'}
        </span>
      )}
      {estado.acertosNoMesmoDia > 0 && (
        // Sem este aviso parece que o app comeu os acertos da pessoa.
        <span
          className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500"
          title="Acertar de novo no mesmo dia não aumenta o prazo: o que fortalece a memória é o intervalo entre as recuperações, não a quantidade delas no mesmo dia."
        >
          +{estado.acertosNoMesmoDia} no mesmo dia (conta amanhã)
        </span>
      )}
      {estado.esticadaPorFlashcard && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">
          <Brain className="h-3 w-3 shrink-0" strokeWidth={2} />
          prazo esticado: assunto em flashcard
        </span>
      )}
      {estado.dominada && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">dominada</span>}
    </p>
  )
}

export default function Erradas() {
  const { user, perfil } = useAuth()
  const { questaoPorId, materias, aulas, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)
  // `null` = ninguém escolheu ainda, então a aba segue os dados. Abrir sempre
  // em "hoje" mostraria uma tela vazia justamente pra quem acabou de errar uma
  // questão — o prazo dela é amanhã. Depois do primeiro clique, a escolha da
  // pessoa manda.
  const [aba, setAba] = useState<'hoje' | 'todas' | null>(null)
  /**
   * `?min=` — o orçamento de tempo escolhido na tela inicial.
   *
   * Vem pelo endereço, e não por estado global, porque é uma decisão de UMA
   * visita: hoje a pessoa tem 15 minutos, amanhã tem uma hora. Guardar isso
   * como preferência faria a fila aparecer cortada num dia em que ela tem
   * tempo sobrando.
   */
  const [params, setParams] = useSearchParams()
  const minutos = Number(params.get('min')) || 0

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  const filtro = useFiltroMateriaAula(materias, aulas)

  // Calculado antes de qualquer saída antecipada: um hook não pode ficar
  // depois de um `return`, e o `useMemo` é o que dá à lista uma identidade
  // estável — sem ela o "carregar mais" nunca sairia da primeira página.
  // Questões cujo assunto já tem baralho de flashcards. Elas voltam com prazo
  // maior: o conteúdo já está sendo recuperado ativamente no cartão, e repetir
  // a mesma coisa duas vezes por semana em dois lugares só enche o dia.
  const comFlashcard = useMemo(
    () => questoesEmFlashcard(assuntosFracos(respostas ?? [], questaoPorId)),
    [respostas, questaoPorId],
  )

  const estados = useMemo(
    () => estadosDeRevisao(respostas ?? [], new Date(), perfil?.revisao, comFlashcard),
    [respostas, perfil?.revisao, comFlashcard],
  )

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
      // A ordem sai de `vencidasPrimeiro`: erro cometido COM CERTEZA no topo,
      // depois o mais atrasado. Numa fila que a pessoa talvez não termine
      // hoje, a ordem é metade do valor da fila.
      // E depois INTERCALADA por assunto: dez questões seguidas do mesmo
      // tema treinam resolver o exercício; alternar treina identificar com
      // que instituto você está lidando — que é o que a prova cobra, onde as
      // questões não vêm separadas por assunto (Brunmair e Richter, 2019,
      // g = 0,42). A intercalação é conservadora: ela só evita vizinhos do
      // mesmo tema, sem furar a ordem de prioridade.
      intercalarPorAssunto(
        vencidasPrimeiro(estados)
          .map((e) => questaoPorId.get(e.questaoId))
          .filter((q): q is NonNullable<typeof q> => !!q),
        (q) => q.tema || '(sem assunto)',
      ),
    [estados, questaoPorId],
  )

  const abaAtiva = aba ?? (paraHoje.length > 0 ? 'hoje' : 'todas')
  /**
   * A fila cortada no tempo que a pessoa disse ter.
   *
   * Cortar não esconde nada: a ordem já põe o mais urgente na frente, então o
   * que sai do corte é o que podia esperar. O que isto evita é a tela de 83
   * questões vencidas num dia de quinze minutos — que é um convite a fechar o
   * app, e fechar o app é o que quebra a repetição espaçada.
   */
  const cabeNoTempo = minutos > 0 ? planoDoDia(minutos, paraHoje.length, 0).questoes : paraHoje.length
  const filaDeHoje = minutos > 0 ? paraHoje.slice(0, cabeNoTempo) : paraHoje
  const base = abaAtiva === 'hoje' ? filaDeHoje : todasErradas
  const lista = useMemo(() => base.filter((q) => filtro.combina(q)), [base, filtro.materiaId, filtro.aulaId])

  const { visiveis, total, temMais, verMais } = useListaVisivel(lista)

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (todasErradas.length === 0 && estados.size === 0) {
    return (
      <div>
        {/* Idem: quem pausou ou recomeçou precisa poder voltar atrás daqui. */}
        <ControleDaRevisao />
        <EmptyState
          icon={XCircle}
          title="Nenhuma questão errada por aqui"
          description="Continue assim! Quando você errar uma questão ela entra num ciclo de revisão: volta amanhã, depois em 3 dias, 7, 21 e 60 — cada vez que você acerta, ela demora mais para voltar."
        />
      </div>
    )
  }

  return (
    <div>
      <ControleDaRevisao />

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

      {minutos > 0 && abaAtiva === 'hoje' && (
        <p className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>
            Fila de <strong>{minutos} minutos</strong>: {filaDeHoje.length} de {paraHoje.length}{' '}
            {paraHoje.length === 1 ? 'questão vencida' : 'questões vencidas'}, as mais urgentes primeiro.
          </span>
          <Link
            to="/erradas"
            onClick={() => setParams({})}
            className="font-semibold underline decoration-blue-300"
          >
            Ver a fila inteira
          </Link>
        </p>
      )}

      <p className="mb-3 text-sm text-slate-500">
        {abaAtiva === 'hoje' ? (
          <>
            Questão errada volta <strong className="text-navy">amanhã</strong>; a cada acerto seguido o intervalo cresce
            para 3, 7, 21 e 60 dias. Se o assunto já tem flashcard, a escada começa um degrau à frente e vai até 120
            dias — o cartão já cobra a memória, a questão volta para cobrar o formato da prova. Estas já passaram da
            hora, na ordem em que vale atacá-las.{' '}
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Shuffle className="h-3 w-3 shrink-0" strokeWidth={2} />
              assuntos intercalados de propósito
            </span>
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
