import { AlertTriangle, BookOpen, ChevronDown, ChevronRight, ExternalLink, PartyPopper } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ControleDaRevisao } from '../components/ControleDaRevisao'
import { QuestionCard } from '../components/QuestionCard'
import { Card } from '../components/ui/Card'
import { CarregarMais } from '../components/ui/CarregarMais'
import { ContentBlock } from '../components/ui/ContentBlock'
import { useAuth } from '../lib/auth/AuthContext'
import { assuntosFracos, questoesEmFlashcard } from '../lib/flashcards'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import { estadosDeRevisao } from '../lib/revisaoEspacada'
import type { Aula, Questao, Resposta } from '../lib/types'

interface Caderno {
  aulaId: string
  aulaTitulo: string
  materiaNome: string
  total: number
  acertos: number
  pct: number
  /** Questões desta aula que já caíram alguma vez — o motivo do caderno existir. */
  erradas: Questao[]
  /** Quantas dessas já passaram da hora de rever. */
  vencidas: number
}

/**
 * Teoria da aula, carregada só quando a pessoa abre o caderno.
 *
 * `useTodasQuestoes` não traz os blocos de propósito (são a parte pesada do
 * tráfego). Aqui eles são exatamente o que interessa — mas de UMA aula por
 * vez, quando pedidos, e não de todas de uma vez ao abrir a tela.
 */
function TeoriaDaAula({ aulaId }: { aulaId: string }) {
  const [aula, setAula] = useState<Aula | null | 'carregando'>('carregando')

  useEffect(() => {
    let ativo = true
    setAula('carregando')
    repo
      .getAula(aulaId)
      .then((a) => ativo && setAula(a))
      .catch(() => ativo && setAula(null))
    return () => {
      ativo = false
    }
  }, [aulaId])

  if (aula === 'carregando') return <p className="py-3 text-sm text-slate-400">Carregando a teoria…</p>
  if (!aula) return <p className="py-3 text-sm text-slate-400">Não foi possível carregar a teoria desta aula.</p>
  if (aula.blocos.length === 0) {
    return (
      <p className="py-3 text-sm text-slate-400">
        Esta aula não tem teoria cadastrada — só questões. As questões que você errou estão logo abaixo.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {aula.blocos.map((b, i) => (
        <ContentBlock key={i} bloco={b} />
      ))}
    </div>
  )
}

export default function Revisao() {
  const { user, perfil } = useAuth()
  const { questaoPorId, aulaPorId, materiaNomePorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  /** Caderno cuja teoria foi aberta — depois de tentar as questões. */
  const [teoriaAberta, setTeoriaAberta] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  // Mesma régua da aba de Questões erradas: assunto com baralho usa a escada
  // esticada. Sem isto, as duas telas diriam prazos diferentes para a mesma
  // questão, e é a contradição que faz a pessoa desconfiar do resto.
  const comFlashcard = useMemo(
    () => questoesEmFlashcard(assuntosFracos(respostas ?? [], questaoPorId)),
    [respostas, questaoPorId],
  )

  const estados = useMemo(
    () => estadosDeRevisao(respostas ?? [], new Date(), perfil?.revisao, comFlashcard),
    [respostas, perfil?.revisao, comFlashcard],
  )

  /**
   * Um caderno por AULA, e não por assunto, porque é na aula que mora a
   * teoria. Um caderno "Crase" sem texto nenhum seria só um rótulo do erro;
   * a promessa aqui é rever o conteúdo, não ser lembrado do tombo.
   */
  const cadernos = useMemo<Caderno[]>(() => {
    if (!respostas) return []

    const porAula = new Map<string, { total: number; acertos: number; erradas: Set<string>; vencidas: number }>()
    for (const r of respostas) {
      const atual = porAula.get(r.aulaId) ?? { total: 0, acertos: 0, erradas: new Set<string>(), vencidas: 0 }
      atual.total += 1
      if (r.correta) atual.acertos += 1
      porAula.set(r.aulaId, atual)
    }
    // As questões do caderno vêm do CICLO (errou alguma vez), não da última
    // resposta: acertar hoje o que você errou ontem não apaga a lacuna.
    for (const estado of estados.values()) {
      const questao = questaoPorId.get(estado.questaoId)
      if (!questao) continue
      const atual = porAula.get(questao.aulaId)
      if (!atual) continue
      atual.erradas.add(estado.questaoId)
      if (estado.vencida) atual.vencidas += 1
    }

    return Array.from(porAula.entries())
      .filter(([, v]) => v.erradas.size > 0)
      .map(([aulaId, v]) => {
        const aula = aulaPorId.get(aulaId)
        return {
          aulaId,
          aulaTitulo: aula?.titulo ?? 'Aula removida',
          materiaNome: aula ? materiaNomePorId.get(aula.materiaId) ?? '' : '',
          total: v.total,
          acertos: v.acertos,
          pct: v.total ? Math.round((v.acertos / v.total) * 100) : 0,
          erradas: Array.from(v.erradas)
            .map((id) => questaoPorId.get(id))
            .filter((q): q is Questao => !!q),
          vencidas: v.vencidas,
        }
      })
      // O que está vencido primeiro; empatou, o pior aproveitamento na frente.
      .sort((a, b) => b.vencidas - a.vencidas || a.pct - b.pct)
  }, [respostas, estados, questaoPorId, aulaPorId, materiaNomePorId])

  // Um caderno por aula com erro: cresce com o acervo. Medido em celular, 288
  // aulas levavam 1.186 ms contra 475 ms com 36. Os primeiros já são os mais
  // urgentes — a ordenação garante isso —, então paginar não esconde nada que
  // importe agora.
  const visiveis = useListaVisivel(cadernos)

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (cadernos.length === 0) {
    return (
      <div>
        {/* O controle fica aqui também: sem ele, quem pausou ou recomeçou
            cairia nesta tela sem nenhuma forma de voltar atrás. */}
        <ControleDaRevisao />
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <PartyPopper className="h-10 w-10 text-brand-blue" strokeWidth={1.5} />
        <p className="font-semibold text-navy">Nenhum caderno aberto por aqui!</p>
        <p className="max-w-sm text-sm text-slate-400">
          Cada questão que você errar abre um caderno: você tenta a questão de novo e, só depois, lê a teoria da aula
          de onde ela veio. Nessa ordem o texto rende muito mais. Continue respondendo questões.
        </p>
      </Card>
      </div>
    )
  }

  const totalVencidas = cadernos.reduce((n, c) => n + c.vencidas, 0)
  const totalQuestoes = cadernos.reduce((n, c) => n + c.erradas.length, 0)

  return (
    <div className="space-y-4">
      <ControleDaRevisao />

      <p className="text-sm text-slate-500">
        <span className="font-semibold text-navy">{cadernos.length}</span>{' '}
        {cadernos.length === 1 ? 'caderno aberto' : 'cadernos abertos'} ·{' '}
        <span className="font-semibold text-navy">{totalQuestoes}</span>{' '}
        {totalQuestoes === 1 ? 'questão no ciclo' : 'questões no ciclo'}
        {totalVencidas > 0 && (
          <>
            {' · '}
            <span className="font-semibold text-rose-600">{totalVencidas}</span> para rever hoje
          </>
        )}
        . Abra um caderno para ver a teoria da aula junto das questões que você errou.
      </p>

      <div className="space-y-3">
        {visiveis.visiveis.map((c) => {
          const estaAberto = aberto === c.aulaId
          const cor = c.pct >= 70 ? 'bg-emerald-500' : c.pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
          return (
            <div key={c.aulaId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setAberto(estaAberto ? null : c.aulaId)}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                {estaAberto ? (
                  <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={2} />
                ) : (
                  <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" strokeWidth={2} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-navy">{c.aulaTitulo}</span>
                  {c.materiaNome && <span className="block text-xs text-slate-400">{c.materiaNome}</span>}
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-slate-500">
                      {c.erradas.length} {c.erradas.length === 1 ? 'questão errada' : 'questões erradas'}
                    </span>
                    {c.vencidas > 0 && (
                      <span className="flex items-center gap-1 font-semibold text-rose-600">
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                        {c.vencidas} para rever hoje
                      </span>
                    )}
                    <span className="text-slate-400">
                      {c.acertos}/{c.total} ({c.pct}%)
                    </span>
                  </span>
                  <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${cor}`} style={{ width: `${c.pct}%` }} />
                  </span>
                </span>
              </button>

              {estaAberto && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  {/* A QUESTÃO VEM ANTES DA TEORIA, e a ordem aqui é o
                      conteúdo da tela, não arrumação visual.

                      Ler a teoria primeiro e depois responder é reestudo com
                      a resposta fresca na cabeça: a pessoa acerta, se sente
                      pronta e não aprendeu quase nada — é a ilusão de
                      competência que Dunlosky e colegas (2013) classificam
                      como técnica de BAIXA utilidade (reler, sublinhar).
                      Tentar recuperar antes, mesmo errando, e só então ler o
                      texto é prática de recuperação com feedback: a técnica de
                      ALTA utilidade da mesma revisão. Por isso a teoria desceu
                      e virou algo que se abre depois de tentar. */}
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={1.75} />
                    Primeiro tente de novo
                  </h3>
                  <p className="mb-3 text-xs text-slate-400">
                    Responda antes de ler a teoria, mesmo sem certeza. Tentar e errar prende mais do que reler o texto
                    com a resposta fresca na cabeça.
                  </p>
                  <div className="space-y-3">
                    {c.erradas.map((q) => (
                      <QuestionCard key={q.id} questao={q} />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setTeoriaAberta((atual) => (atual === c.aulaId ? null : c.aulaId))}
                    aria-expanded={teoriaAberta === c.aulaId}
                    className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-blue"
                  >
                    <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                    {teoriaAberta === c.aulaId ? 'Esconder a teoria da aula' : 'Agora sim: ver a teoria da aula'}
                  </button>
                  {teoriaAberta === c.aulaId && (
                    <div className="mt-3">
                      <TeoriaDaAula aulaId={c.aulaId} />
                    </div>
                  )}

                  <Link
                    to={`/aulas/${c.aulaId}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
                  >
                    Abrir a aula completa
                    <ExternalLink className="h-4 w-4" strokeWidth={2} />
                  </Link>
                </div>
              )}
            </div>
          )
        })}
        <CarregarMais
          mostrando={visiveis.visiveis.length}
          total={visiveis.total}
          temMais={visiveis.temMais}
          onVerMais={visiveis.verMais}
        />
      </div>
    </div>
  )
}
