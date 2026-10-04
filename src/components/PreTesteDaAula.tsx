import { ArrowRight, BookOpen, Lightbulb, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TextoComTabelas } from './ui/TextoComTabelas'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import type { Aula } from '../lib/types'

/**
 * Pré-teste: tentar responder ANTES de ler a aula.
 *
 * ======================== POR QUE ERRAR ANTES AJUDA =======================
 *
 * Parece absurdo responder sobre um assunto que você não estudou — e a
 * sensação de quem faz é de que está perdendo tempo. Mas é um dos efeitos
 * melhor medidos da área. A meta-análise de 2023 sobre o efeito de
 * pré-questão (97 tamanhos de efeito) encontra g = 0,54 no material que foi
 * perguntado antes. Carpenter e Toftness (2017) mostraram o mesmo com vídeo:
 * perguntar antes de cada trecho melhorou a retenção depois.
 *
 * O mecanismo é atenção. Depois de tentar e não saber, você lê o texto
 * procurando a resposta daquela dúvida específica, em vez de passar os olhos
 * de cima a baixo achando que está entendendo. A dúvida vira um gancho.
 *
 * DUAS RESSALVAS que esta tela respeita, porque elas mudam o desenho:
 *
 * 1. O ganho é no material PERGUNTADO (g = 0,54); no material não perguntado
 *    é praticamente zero (g = 0,04). Então as perguntas saem das questões DA
 *    PRÓPRIA AULA, e espalhadas por ela — não de um bolo aleatório do acervo,
 *    que daria a ilusão de preparar e não prepararia nada.
 *
 * 2. O ganho depende de PODER ESTUDAR A RESPOSTA depois. Por isso o gabarito
 *    aparece na hora e o fim do pré-teste é um botão que leva para a teoria,
 *    e não um placar.
 *
 * ===================== POR QUE NADA AQUI É GRAVADO ========================
 *
 * Nenhuma resposta do pré-teste vira `resposta` no banco. Chute sobre
 * conteúdo que a pessoa nunca viu não mede conhecimento nenhum: entraria no
 * Desempenho como erro, puxaria o aproveitamento para baixo sem motivo e
 * encheria o ciclo de revisão de questões que ela nem leu ainda. O pré-teste
 * é um instrumento de atenção, não uma avaliação — e a avaliação vem depois,
 * na aba de questões da aula, quando ela já estudou.
 */

/** Perguntas do pré-teste. Poucas de propósito: é um gancho, não um simulado. */
const QUANTAS = 3

/** Aulas em que a pessoa dispensou o pré-teste — para não insistir. */
const CHAVE_DISPENSADAS = 'mpe:pre-teste-dispensadas'

function dispensadas(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_DISPENSADAS) ?? '[]')
  } catch {
    return []
  }
}

export function dispensouPreTeste(aulaId: string): boolean {
  return dispensadas().includes(aulaId)
}

function dispensar(aulaId: string) {
  try {
    localStorage.setItem(CHAVE_DISPENSADAS, JSON.stringify([...new Set([...dispensadas(), aulaId])].slice(-200)))
  } catch {
    /* sem armazenamento: a dispensa vale só nesta visita */
  }
}

export function PreTesteDaAula({ aula, onIrParaTeoria }: { aula: Aula; onIrParaTeoria: () => void }) {
  const [fase, setFase] = useState<'oferta' | 'perguntando' | 'fim' | 'fora'>('oferta')
  const [indice, setIndice] = useState(0)
  const [escolha, setEscolha] = useState<string | null>(null)

  /**
   * As perguntas, espalhadas pela aula.
   *
   * Espalhadas e não as três primeiras: as questões de uma aula seguem a
   * ordem do conteúdo, então pegar as três do começo perguntaria só sobre a
   * introdução — e o ganho é no material perguntado.
   */
  const perguntas = useMemo(() => {
    const todas = aula.questoes
    if (todas.length <= QUANTAS) return todas
    const passo = todas.length / QUANTAS
    return Array.from({ length: QUANTAS }, (_, i) => todas[Math.floor(i * passo)])
  }, [aula.questoes])

  if (fase === 'fora' || perguntas.length < 2) return null

  if (fase === 'oferta') {
    return (
      <Card className="mb-4 space-y-3 border-amber-200 bg-amber-50/50">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-bold text-navy">Tentar antes de ler?</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {perguntas.length} perguntas desta aula, respondidas <strong>antes</strong> de estudar. Você
              provavelmente vai errar — é o ponto. Depois de tentar, você lê o texto procurando a resposta daquela
              dúvida, em vez de passar os olhos achando que entendeu. Em 97 comparações, o material perguntado antes
              foi lembrado bem melhor (g = 0,54).{' '}
              <strong className="text-navy">Nada disto conta no seu desempenho.</strong>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setFase('perguntando')} className="px-3 py-2 text-sm">
            Começar o pré-teste
          </Button>
          <button
            type="button"
            onClick={() => {
              dispensar(aula.id)
              setFase('fora')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
          >
            <X className="h-4 w-4" strokeWidth={2} />
            Ler direto
          </button>
        </div>
      </Card>
    )
  }

  if (fase === 'fim') {
    return (
      <Card className="mb-4 space-y-3 border-amber-200 bg-amber-50/50">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />
          <p className="text-sm text-slate-600">
            <strong className="text-navy">Agora o texto rende mais.</strong> Você já sabe quais são as dúvidas —
            leia procurando por elas. As mesmas questões (e as outras da aula) esperam na aba de questões, e lá elas
            valem de verdade.
          </p>
        </div>
        <Button
          onClick={() => {
            // Sai da frente: o texto da aula está logo abaixo, e deixar o
            // cartão do pré-teste ocupando a primeira tela empurraria para
            // baixo justamente o que a pessoa acabou de ser mandada ler.
            setFase('fora')
            onIrParaTeoria()
          }}
          className="px-3 py-2 text-sm"
        >
          Ler a teoria
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Button>
      </Card>
    )
  }

  const questao = perguntas[indice]
  const respondeu = escolha !== null
  const acertou = escolha === questao.gabarito

  function proxima() {
    setEscolha(null)
    if (indice + 1 >= perguntas.length) setFase('fim')
    else setIndice((i) => i + 1)
  }

  return (
    <Card className="mb-4 space-y-3 border-amber-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
          Pré-teste · {indice + 1} de {perguntas.length}
        </p>
        <button
          type="button"
          onClick={() => {
            dispensar(aula.id)
            setFase('fora')
          }}
          className="text-xs font-medium text-slate-400 hover:text-navy"
        >
          Encerrar
        </button>
      </div>

      <TextoComTabelas texto={questao.enunciado} className="text-sm leading-relaxed text-slate-800" />

      <div className="space-y-2">
        {questao.alternativas.map((alt) => {
          const isEscolha = escolha === alt.id
          const isGabarito = alt.id === questao.gabarito
          let classes = 'border-slate-200 hover:border-brand-blue'
          if (respondeu) {
            if (isGabarito) classes = 'border-emerald-400 bg-emerald-50'
            else if (isEscolha) classes = 'border-rose-400 bg-rose-50'
            else classes = 'border-slate-200 opacity-60'
          }
          return (
            <button
              key={alt.id}
              type="button"
              disabled={respondeu}
              onClick={() => setEscolha(alt.id)}
              className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${classes}`}
            >
              <span className="font-bold text-navy">{alt.id}</span>
              <span className="text-slate-700">{alt.texto}</span>
            </button>
          )
        })}
      </div>

      {respondeu && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          {/* Errar aqui é o esperado, e a tela diz isso: quem acha que
              fracassou no pré-teste simplesmente não faz o próximo. */}
          <p className={acertou ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-700'}>
            {acertou ? 'Acertou — e você ainda não leu.' : `Gabarito: ${questao.gabarito}. Errar aqui é o normal.`}
          </p>
          {questao.explicacao && <TextoComTabelas texto={questao.explicacao} className="text-slate-600" />}
          <Button onClick={proxima} variant="secondary" className="px-3 py-1.5 text-xs">
            {indice + 1 >= perguntas.length ? 'Terminar' : 'Próxima'}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Button>
        </div>
      )}
    </Card>
  )
}
