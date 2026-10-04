import { Brain, Check, ChevronDown, ChevronRight, Clock, Eye, Layers, PartyPopper, Shuffle, Target } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { TextoComTabelas } from '../components/ui/TextoComTabelas'
import { useAuth } from '../lib/auth/AuthContext'
import {
  assuntosFracos,
  ERROS_PARA_VIRAR_BARALHO,
  montarFila,
  NOVOS_POR_DIA_PADRAO,
  proximoEstado,
  textoDoIntervalo,
  type AssuntoFraco,
  type EstadoCartao,
  type Nota,
} from '../lib/flashcards'
import { intercalarPorAssunto } from '../lib/intercalar'
import { planoDoDia } from '../lib/sessaoDoDia'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import type { Questao, Resposta } from '../lib/types'

/** Preferência de ritmo: fica no aparelho, como a da correção adiada. */
const CHAVE_NOVOS = 'mpe:flashcards-novos-por-dia'

const NOTAS: { nota: Nota; rotulo: string; dica: string; classe: string }[] = [
  { nota: 'errei', rotulo: 'Errei', dica: 'volta amanhã', classe: 'bg-rose-50 text-rose-700 border-rose-300' },
  { nota: 'dificil', rotulo: 'Difícil', dica: 'volta logo', classe: 'bg-amber-50 text-amber-700 border-amber-300' },
  { nota: 'bom', rotulo: 'Bom', dica: 'no ritmo', classe: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { nota: 'facil', rotulo: 'Fácil', dica: 'demora mais', classe: 'bg-sky-50 text-sky-700 border-sky-300' },
]

function lerNovosPorDia(): number {
  try {
    const cru = localStorage.getItem(CHAVE_NOVOS)
    const n = cru ? Number(cru) : NaN
    return Number.isFinite(n) && n >= 0 && n <= 50 ? n : NOVOS_POR_DIA_PADRAO
  } catch {
    return NOVOS_POR_DIA_PADRAO
  }
}

export default function Flashcards() {
  const { user } = useAuth()
  const { questaoPorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)
  const [estados, setEstados] = useState<Map<string, EstadoCartao>>(new Map())
  const [novosPorDia, setNovosPorDia] = useState(NOVOS_POR_DIA_PADRAO)

  /** Cartão aberto na sessão de estudo, e se o verso já foi virado. */
  const [emEstudo, setEmEstudo] = useState<string[] | null>(null)
  const [indice, setIndice] = useState(0)
  const [virado, setVirado] = useState(false)
  const [feitosAgora, setFeitosAgora] = useState(0)
  const [assuntoAberto, setAssuntoAberto] = useState<string | null>(null)
  /** `?min=` — o orçamento de tempo que veio da tela inicial, se veio. */
  const [params] = useSearchParams()
  const minutos = Number(params.get('min')) || 0

  useEffect(() => {
    setNovosPorDia(lerNovosPorDia())
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelado = false
    Promise.all([repo.listRespostas(user.id), repo.listFlashcards(user.id)]).then(([rs, fs]) => {
      if (cancelado) return
      setRespostas(rs)
      setEstados(new Map(fs.map((f) => [f.questaoId, f])))
    })
    return () => {
      cancelado = true
    }
  }, [user])

  const assuntos = useMemo<AssuntoFraco[]>(
    () => (respostas ? assuntosFracos(respostas, questaoPorId) : []),
    [respostas, questaoPorId],
  )

  const fila = useMemo(
    () => montarFila(assuntos, estados, new Date(), { novosPorDia }),
    [assuntos, estados, novosPorDia],
  )

  const guardarNovosPorDia = useCallback((n: number) => {
    setNovosPorDia(n)
    try {
      localStorage.setItem(CHAVE_NOVOS, String(n))
    } catch {
      /* armazenamento bloqueado: a preferência vale só nesta sessão */
    }
  }, [])

  function comecar() {
    // Vencidos antes dos novos: o que está prestes a ser esquecido tem
    // prioridade sobre o que a pessoa nunca viu.
    // Filtra aqui, e não durante a renderização: chamar setIndice no meio do
    // render para pular uma questão apagada é exatamente o caminho do "too
    // many re-renders". A fila sai pronta.
    let ordem = [...fila.revisar, ...fila.novos].filter((id) => questaoPorId.has(id))
    // Assuntos intercalados: alternar entre temas treina DISCRIMINAR entre
    // institutos parecidos, que é o que a prova cobra (Brunmair e Richter,
    // 2019). Os vencidos continuam na frente dos novos — a intercalação só
    // evita vizinhos do mesmo tema.
    ordem = intercalarPorAssunto(ordem, (id) => questaoPorId.get(id)?.tema || '(sem assunto)')
    // E cortada no tempo que a pessoa disse ter, quando ela disse.
    if (minutos > 0) {
      const cabe = planoDoDia(minutos, 0, ordem.length).cartoes
      ordem = ordem.slice(0, cabe)
    }
    if (ordem.length === 0) return
    setEmEstudo(ordem)
    setIndice(0)
    setVirado(false)
    setFeitosAgora(0)
  }

  async function responder(nota: Nota) {
    if (!user || !emEstudo) return
    const questaoId = emEstudo[indice]
    const novo = proximoEstado(estados.get(questaoId) ?? null, questaoId, nota)
    // A tela anda na hora; a gravação vai atrás. Esperar o banco entre um
    // cartão e outro transformaria uma sessão de trinta cartões em trinta
    // esperas.
    setEstados((atual) => new Map(atual).set(questaoId, novo))
    setFeitosAgora((n) => n + 1)
    setVirado(false)
    setIndice((i) => i + 1)
    try {
      await repo.salvarFlashcard(user.id, novo)
    } catch {
      /* a próxima abertura da tela relê do banco e corrige */
    }
  }

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  // ----------------------------------------------------------- em estudo --
  if (emEstudo && indice < emEstudo.length) {
    const questaoId = emEstudo[indice]
    const questao = questaoPorId.get(questaoId)
    // A fila já veio filtrada; se a questão sumiu no meio da sessão, encerra
    // em vez de mexer em estado durante o render.
    if (!questao) {
      return (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-semibold text-navy">Esta questão não está mais disponível</p>
          <Button onClick={() => setEmEstudo(null)}>Voltar</Button>
        </Card>
      )
    }
    const estado = estados.get(questaoId)
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Cartão <strong className="text-navy">{indice + 1}</strong> de {emEstudo.length}
            {questao.tema && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                <Shuffle className="h-3 w-3 shrink-0 text-slate-400" strokeWidth={2} />
                {questao.tema}
              </span>
            )}
          </p>
          <Button variant="secondary" onClick={() => setEmEstudo(null)} className="px-3 py-1.5 text-xs">
            Encerrar
          </Button>
        </div>

        <Card className="space-y-4">
          {/* A frente é o enunciado SEM as alternativas: é isso que troca
              reconhecimento por produção da resposta, que é de onde vem o
              ganho medido. */}
          <TextoComTabelas texto={questao.enunciado} className="text-sm leading-relaxed text-slate-800" />

          {!virado ? (
            <Button onClick={() => setVirado(true)} className="w-full">
              <Eye className="h-4 w-4" strokeWidth={2} />
              Mostrar resposta
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-emerald-700">Gabarito: {questao.gabarito}</p>
                {questao.alternativas.find((a) => a.id === questao.gabarito) && (
                  <p className="mt-1 text-slate-700">
                    {questao.alternativas.find((a) => a.id === questao.gabarito)?.texto}
                  </p>
                )}
                {questao.explicacao && (
                  <TextoComTabelas texto={questao.explicacao} className="mt-2 text-slate-600" />
                )}
              </div>

              <div>
                <p className="mb-2 text-xs text-slate-500">
                  Quanto custou lembrar? A resposta honesta é o que faz o espaçamento funcionar.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {NOTAS.map((n) => {
                    const previsto = proximoEstado(estado ?? null, questaoId, n.nota)
                    return (
                      <button
                        key={n.nota}
                        type="button"
                        onClick={() => responder(n.nota)}
                        className={`rounded-lg border px-2 py-2 text-sm font-semibold ${n.classe}`}
                      >
                        {n.rotulo}
                        <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                          {textoDoIntervalo(previsto.intervaloDias)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    )
  }

  // ------------------------------------------------------- fim da sessão --
  if (emEstudo && indice >= emEstudo.length) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <PartyPopper className="h-10 w-10 text-brand-blue" strokeWidth={1.5} />
        <p className="font-semibold text-navy">Sessão concluída</p>
        <p className="max-w-sm text-sm text-slate-400">
          {feitosAgora} {feitosAgora === 1 ? 'cartão revisado' : 'cartões revisados'}. Cada um já tem data para
          voltar — não precisa adiantar nada hoje.
        </p>
        <Button onClick={() => setEmEstudo(null)}>Voltar</Button>
      </Card>
    )
  }

  // --------------------------------------------------------------- lista --
  if (assuntos.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="Nenhum assunto virou flashcard ainda"
        description={`Um assunto entra aqui quando você erra ${ERROS_PARA_VIRAR_BARALHO} vezes dentro dele. Um erro é acidente; três é padrão — e é padrão que vale atacar com repetição espaçada. Continue respondendo questões.`}
      />
    )
  }

  const paraHoje = fila.revisar.length + fila.novos.length

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-bold text-navy">
              {paraHoje === 0 ? 'Nada para hoje' : `${paraHoje} ${paraHoje === 1 ? 'cartão' : 'cartões'} para hoje`}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {fila.revisar.length > 0 && (
                <>
                  <strong className="text-navy">{fila.revisar.length}</strong> para rever
                  {fila.novos.length > 0 && ' · '}
                </>
              )}
              {fila.novos.length > 0 && (
                <>
                  <strong className="text-brand-blue">{fila.novos.length}</strong> novos
                </>
              )}
              {paraHoje === 0 && 'Os cartões voltam sozinhos no prazo de cada um.'}
            </p>
          </div>
        </div>

        {minutos > 0 && paraHoje > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>
              Sessão de <strong>{minutos} minutos</strong>: até{' '}
              <strong>{planoDoDia(minutos, 0, paraHoje).cartoes}</strong> cartões, os mais atrasados primeiro.
            </span>
          </p>
        )}

        {paraHoje > 0 && (
          <Button onClick={comecar} className="w-full">
            <Layers className="h-4 w-4" strokeWidth={2} />
            {minutos > 0 ? `Estudar ${minutos} minutos` : 'Estudar agora'}
          </Button>
        )}

        <label className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>Cartões novos por dia</span>
          <input
            type="number"
            min={0}
            max={50}
            value={novosPorDia}
            onChange={(e) => guardarNovosPorDia(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-blue"
          />
          {/* O número que decide se o hábito sobrevive: o custo de um cartão
              novo não é hoje, é o rastro de revisões dos próximos meses. */}
          <span className="text-slate-400">
            o limite protege os próximos meses — cada novo de hoje volta muitas vezes
          </span>
        </label>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          Assuntos que você erra sempre
        </h2>
        <div className="space-y-2">
          {assuntos.map((a) => {
            const aberto = assuntoAberto === a.tema
            const cartoes = a.questaoIds.map((id) => ({ id, questao: questaoPorId.get(id), estado: estados.get(id) }))
            const vistos = cartoes.filter((c) => c.estado).length
            return (
              <div key={a.tema} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setAssuntoAberto(aberto ? null : a.tema)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  {aberto ? (
                    <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={2} />
                  ) : (
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" strokeWidth={2} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-navy">{a.tema}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-rose-600">{a.erros} erros</span>
                      {a.errosComCerteza > 0 && (
                        <span className="font-semibold text-rose-700" title="Erro cometido com certeza declarada — é o que mais rende corrigir, e por isso esses cartões entram primeiro.">
                          {a.errosComCerteza} com certeza
                        </span>
                      )}
                      {a.acertosChutados > 0 && (
                        <span className="text-slate-500" title="Acertos que você marcou como chute: sorte, não conhecimento. O assunto continua frágil.">
                          {a.acertosChutados} {a.acertosChutados === 1 ? 'acerto chutado' : 'acertos chutados'}
                        </span>
                      )}
                      <span className="text-slate-400">{a.pct}% de aproveitamento</span>
                      <span className="text-slate-400">
                        {cartoes.length} {cartoes.length === 1 ? 'cartão' : 'cartões'}
                        {vistos > 0 && ` · ${vistos} em andamento`}
                      </span>
                    </span>
                  </span>
                </button>

                {aberto && (
                  <ul className="border-t border-slate-100 px-3 py-2">
                    {cartoes.map(({ id, questao, estado }) => (
                      <li key={id} className="flex items-start gap-2 border-b border-slate-50 py-2 last:border-0">
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                          {questao?.enunciado ?? 'Questão removida'}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {estado ? (
                            <span className="inline-flex items-center gap-1">
                              <Check className="h-3 w-3 text-emerald-500" strokeWidth={2.5} />
                              volta {textoDoIntervalo(estado.intervaloDias)}
                            </span>
                          ) : (
                            'novo'
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
