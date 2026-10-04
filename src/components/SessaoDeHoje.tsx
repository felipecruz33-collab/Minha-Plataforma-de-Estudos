import { Clock, Flame, Layers, ListChecks, PartyPopper } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'
import { cartoesVencidos, planoDoDia, questoesVencidas, TEMPOS_OFERECIDOS } from '../lib/sessaoDoDia'
import { assuntosFracos, questoesEmFlashcard, type EstadoCartao } from '../lib/flashcards'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import { estadosDeRevisao } from '../lib/revisaoEspacada'
import type { Resposta } from '../lib/types'
import { Card } from './ui/Card'

/** Preferência de tempo: o dia ruim costuma se repetir, então ela fica guardada. */
const CHAVE_TEMPO = 'mpe:tempo-de-hoje'

/**
 * "Quanto tempo você tem hoje?"
 *
 * A pergunta é esta, e não "o que você quer estudar". No dia em que o
 * trabalho atrasou e a cabeça não está boa, a decisão real é estudar um
 * pouco ou não abrir o app — e não abrir é o que quebra a corrente, porque
 * repetição espaçada só funciona se as sessões acontecerem. Ver
 * `sessaoDoDia.ts` para a evidência por trás da ordem das coisas.
 */
export function SessaoDeHoje() {
  const { user, perfil } = useAuth()
  const { questaoPorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)
  const [cartoes, setCartoes] = useState<EstadoCartao[]>([])
  const [minutos, setMinutos] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(CHAVE_TEMPO))
      return TEMPOS_OFERECIDOS.includes(n as never) ? n : 15
    } catch {
      return 15
    }
  })

  useEffect(() => {
    if (!user) return
    let cancelado = false
    Promise.all([repo.listRespostas(user.id), repo.listFlashcards(user.id)]).then(([rs, fs]) => {
      if (cancelado) return
      setRespostas(rs)
      setCartoes(fs)
    })
    return () => {
      cancelado = true
    }
  }, [user])

  const estados = useMemo(() => {
    if (!respostas) return new Map()
    const comFlashcard = questoesEmFlashcard(assuntosFracos(respostas, questaoPorId))
    return estadosDeRevisao(respostas, new Date(), perfil?.revisao, comFlashcard)
  }, [respostas, questaoPorId, perfil?.revisao])

  const plano = useMemo(() => {
    const porEstado = new Map(cartoes.map((c) => [c.questaoId, c]))
    return planoDoDia(minutos, questoesVencidas(estados), cartoesVencidos(porEstado))
  }, [minutos, estados, cartoes])

  function escolherTempo(n: number) {
    setMinutos(n)
    try {
      localStorage.setItem(CHAVE_TEMPO, String(n))
    } catch {
      /* sem armazenamento a escolha vale só nesta visita */
    }
  }

  // Enquanto carrega, nada: um esqueleto piscando no topo da tela inicial
  // incomoda mais do que ajuda.
  if (loading || respostas === null) return null

  if (plano.vazia) {
    // Dia em dia merece ser dito com alegria, e não com uma caixa vazia.
    return (
      <Card className="mb-5 flex items-start gap-3">
        <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />
        <p className="text-sm text-slate-600">
          <strong className="text-navy">Revisão de hoje em dia.</strong> Nada venceu o prazo — nem questão, nem
          cartão. Se tiver tempo sobrando, questões novas em{' '}
          <Link to="/questoes" className="font-semibold text-brand-blue hover:underline">
            Questões
          </Link>{' '}
          são o melhor uso dele.
        </p>
      </Card>
    )
  }

  return (
    <Card className="mb-5 space-y-3">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="font-bold text-navy">Quanto tempo você tem hoje?</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Dia curto não é dia perdido: dez minutos de questão rendem mais que uma hora de releitura — e memória
            treinada respondendo é a que resiste melhor ao dia estressado.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TEMPOS_OFERECIDOS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => escolherTempo(n)}
            aria-pressed={minutos === n}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              minutos === n
                ? 'border-brand-blue bg-blue-50 text-brand-blue'
                : 'border-slate-300 text-slate-600 hover:border-brand-blue'
            }`}
          >
            {n} min
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        Cabe{' '}
        {plano.cartoes > 0 && (
          <>
            <strong className="text-navy">{plano.cartoes}</strong>{' '}
            {plano.cartoes === 1 ? 'cartão' : 'cartões'}
            {plano.cartoesDisponiveis > plano.cartoes && (
              <span className="text-slate-400"> de {plano.cartoesDisponiveis}</span>
            )}
            {plano.questoes > 0 && ' e '}
          </>
        )}
        {plano.questoes > 0 && (
          <>
            <strong className="text-navy">{plano.questoes}</strong>{' '}
            {plano.questoes === 1 ? 'questão' : 'questões'}
            {plano.questoesDisponiveis > plano.questoes && (
              <span className="text-slate-400"> de {plano.questoesDisponiveis}</span>
            )}
          </>
        )}
        . O resto fica para amanhã sem prejuízo — a fila é ordenada pelo que está mais perto de ser esquecido.
      </p>

      <div className="flex flex-wrap gap-2">
        {plano.cartoes > 0 && (
          <Link
            to={`/flashcards?min=${minutos}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2 text-sm font-semibold text-white"
          >
            <Layers className="h-4 w-4" strokeWidth={2} />
            Começar pelos cartões
          </Link>
        )}
        {plano.questoes > 0 && (
          <Link
            to={`/erradas?min=${minutos}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-blue"
          >
            <ListChecks className="h-4 w-4" strokeWidth={2} />
            Ir para as questões
          </Link>
        )}
      </div>

      {plano.questoesDisponiveis + plano.cartoesDisponiveis > plano.questoes + plano.cartoes && (
        <p className="flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={2} />
          <span>
            Tem mais na fila do que cabe em {minutos} minutos. Isso é normal e não é dívida: o que não couber hoje
            continua vencido amanhã, e a ordem garante que o mais urgente seja o que você faz primeiro.
          </span>
        </p>
      )}
    </Card>
  )
}
