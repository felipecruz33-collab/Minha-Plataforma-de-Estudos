import { EyeOff, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { Questao, Resposta } from '../lib/types'
import { Card } from './ui/Card'

interface QuestionCardProps {
  questao: Questao
  /**
   * Resposta que a pessoa já tinha marcado antes, se a tela souber dela.
   *
   * Sem isto o cartão sempre nasce em branco — que é o certo no simulado (a
   * graça é responder de novo) e na aula. Quem passa este dado é a tela de
   * Questões, onde o filtro "feitas / não feitas" só faz sentido se o cartão
   * mostrar a mesma coisa que o filtro está dizendo.
   */
  respostaAnterior?: Resposta | null
  /**
   * Se vier, o cartão mostra o botão de excluir.
   *
   * Opcional porque só a tela de Questões oferece isso: no simulado em
   * andamento e no meio de uma aula, um botão de apagar ao lado das
   * alternativas é um erro esperando acontecer. Quem decide se a pessoa PODE
   * apagar aquela questão é a tela — e, no fim, a RLS do banco.
   */
  onExcluir?: () => void
  onRespondida?: (correta: boolean) => void
  /**
   * Não revelar o resultado assim que a pessoa responde.
   *
   * Serve pra quem quer fazer uma sequência de questões sem ser influenciado:
   * ver o gabarito da questão 1 muda a forma de ler a questão 2. A resposta
   * continua sendo GRAVADA na hora — o que fica adiado é só a revelação, e é
   * por isso que sair da tela no meio não perde nada.
   */
  correcaoAdiada?: boolean
  /** Quando true, mostra o resultado mesmo com a correção adiada. */
  revelada?: boolean
}

export function QuestionCard({
  questao,
  respostaAnterior,
  onExcluir,
  onRespondida,
  correcaoAdiada = false,
  revelada = false,
}: QuestionCardProps) {
  const { user, perfil, toggleFavorito } = useAuth()
  const [escolha, setEscolha] = useState<string | null>(respostaAnterior?.alternativaEscolhida ?? null)
  const [respondida, setRespondida] = useState(!!respostaAnterior)

  // Só depende do id: responder aqui na hora NÃO muda `respostaAnterior` (a
  // tela de origem não recarrega a lista a cada clique), então este efeito não
  // dispara e não apaga o que a pessoa acabou de marcar. Ele existe pro caso
  // contrário — "esquecer respostas" tira a marcação e o cartão precisa voltar
  // a ficar em branco sem a tela ter que remontar tudo.
  useEffect(() => {
    setEscolha(respostaAnterior?.alternativaEscolhida ?? null)
    setRespondida(!!respostaAnterior)
  }, [respostaAnterior?.id])

  const favorita = perfil?.favoritos.includes(questao.id) ?? false
  /** Respondida é uma coisa; MOSTRAR o resultado é outra. */
  const mostrarResultado = respondida && (!correcaoAdiada || revelada)

  async function responder(altId: string) {
    if (respondida || !user) return
    const correta = altId === questao.gabarito
    setEscolha(altId)
    setRespondida(true)
    // Avisar o pai ANTES de gravar, e não depois, não é detalhe de estilo: é o
    // que faz a correção adiada funcionar. É este aviso que põe a questão na
    // fila de pendentes, e é de lá que sai o `revelada`. Com ele depois do
    // `await`, entre o clique e a volta do banco existia um render com
    // `respondida` já true e `revelada` ainda true: o verde/vermelho piscava na
    // tela antes de sumir — e meio segundo de verde já entrega o gabarito, que
    // é exatamente o que a pessoa pediu para não ver. Assim as duas mudanças de
    // estado caem no mesmo render e nada chega a aparecer.
    onRespondida?.(correta)
    await repo.registrarResposta({
      userId: user.id,
      questaoId: questao.id,
      aulaId: questao.aulaId,
      materiaId: questao.materiaId,
      alternativaEscolhida: altId,
      correta,
    })
  }

  const metaInfo = [questao.banca, questao.orgao, questao.ano].filter(Boolean).join(' · ')

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs text-slate-400">
          {questao.tema && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{questao.tema}</span>}
          {metaInfo && <span>{metaInfo}</span>}
        </div>
        <button
          type="button"
          onClick={() => toggleFavorito(questao.id)}
          aria-label="Favoritar"
          className="shrink-0"
        >
          <Star
            className={`h-5 w-5 ${favorita ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
            strokeWidth={1.75}
          />
        </button>
      </div>

      {/* `whitespace-pre-line` porque o enunciado pode trazer um TEXTO DE
          APOIO antes do comando — o poema, a notícia, o trecho de lei que a
          questão manda ler. Sem isso o HTML come as quebras de linha e o texto
          inteiro vira um bloco só, colado na pergunta. */}
      <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-slate-800">{questao.enunciado}</p>

      <div className="space-y-2">
        {questao.alternativas.map((alt) => {
          const isEscolha = escolha === alt.id
          const isGabarito = alt.id === questao.gabarito
          let classes = 'border-slate-200 hover:border-brand-blue'
          if (mostrarResultado) {
            if (isGabarito) classes = 'border-emerald-400 bg-emerald-50'
            else if (isEscolha) classes = 'border-rose-400 bg-rose-50'
            else classes = 'border-slate-200 opacity-60'
          } else if (respondida) {
            // Marcada, sem dizer se está certa. Azul e não verde/vermelho de
            // propósito: a cor não pode entregar o gabarito.
            classes = isEscolha ? 'border-brand-blue bg-blue-50' : 'border-slate-200 opacity-60'
          }
          return (
            <button
              key={alt.id}
              type="button"
              disabled={respondida}
              onClick={() => responder(alt.id)}
              className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${classes}`}
            >
              <span className="font-bold text-navy">{alt.id}</span>
              <span className="text-slate-700">{alt.texto}</span>
            </button>
          )
        })}
      </div>

      {respondida && !mostrarResultado && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
          <EyeOff className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Resposta marcada. A correção aparece quando você pedir.
        </p>
      )}

      {mostrarResultado && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p className={escolha === questao.gabarito ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
            {escolha === questao.gabarito ? 'Você acertou!' : `Gabarito: ${questao.gabarito}`}
          </p>
          {questao.explicacao && <p className="text-slate-600">{questao.explicacao}</p>}
          {questao.altExp[escolha ?? ''] && <p className="text-slate-500">{questao.altExp[escolha ?? '']}</p>}
        </div>
      )}

      {onExcluir && (
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={onExcluir}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Excluir questão
          </button>
        </div>
      )}
    </Card>
  )
}
