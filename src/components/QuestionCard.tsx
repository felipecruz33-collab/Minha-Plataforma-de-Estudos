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
   * Modo rascunho: marcar sem gravar, e poder trocar até mandar corrigir.
   *
   * Quando este callback vem, o cartão para de gravar no clique e para de
   * travar depois dele. A escolha vira um rascunho que mora na tela de
   * Questões, e a pessoa pode mudar de ideia quantas vezes quiser — porque
   * enquanto o gabarito não apareceu ela não recebeu nenhuma informação nova,
   * e a marca anterior não era uma tentativa, era um palpite em aberto. A
   * gravação acontece uma vez só, quando ela mandar corrigir.
   *
   * Serve pra quem quer fazer uma sequência sem ser influenciado: ver o
   * gabarito da questão 1 muda a forma de ler a questão 2.
   */
  onMarcarRascunho?: (alternativaId: string) => void
  /** A alternativa marcada em rascunho, se houver. */
  rascunho?: string | null
}

export function QuestionCard({
  questao,
  respostaAnterior,
  onExcluir,
  onRespondida,
  onMarcarRascunho,
  rascunho = null,
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
  /**
   * Em rascunho só enquanto NÃO existe resposta gravada: depois de corrigida a
   * questão está fechada, e o cartão volta a ser o de sempre.
   *
   * O `!respondida` cobre quem responde no modo normal e SÓ DEPOIS liga a
   * caixa de adiar: a tela ainda não releu as respostas, então ela mandaria o
   * cartão para o rascunho — o resultado que já estava na tela sumiria, e a
   * questão voltaria a aceitar clique, virando uma segunda tentativa por cima
   * de uma que já valeu.
   */
  const emRascunho = !!onMarcarRascunho && !respostaAnterior && !respondida
  const escolhaAtual = emRascunho ? rascunho : escolha
  const marcada = emRascunho ? !!rascunho : respondida
  /** Marcada é uma coisa; MOSTRAR o resultado é outra. */
  const mostrarResultado = !emRascunho && respondida

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
          const isEscolha = escolhaAtual === alt.id
          const isGabarito = alt.id === questao.gabarito
          let classes = 'border-slate-200 hover:border-brand-blue'
          if (mostrarResultado) {
            if (isGabarito) classes = 'border-emerald-400 bg-emerald-50'
            else if (isEscolha) classes = 'border-rose-400 bg-rose-50'
            else classes = 'border-slate-200 opacity-60'
          } else if (marcada) {
            // Marcada, sem dizer se está certa. Azul e não verde/vermelho de
            // propósito: a cor não pode entregar o gabarito. Em rascunho as
            // outras continuam clicáveis — trocar é o ponto — então elas não
            // ficam apagadas como ficam depois de gravada.
            classes = isEscolha
              ? 'border-brand-blue bg-blue-50'
              : emRascunho
                ? 'border-slate-200 hover:border-brand-blue'
                : 'border-slate-200 opacity-60'
          }
          return (
            <button
              key={alt.id}
              type="button"
              disabled={!emRascunho && respondida}
              onClick={() => (emRascunho ? onMarcarRascunho?.(alt.id) : responder(alt.id))}
              className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${classes}`}
            >
              <span className="font-bold text-navy">{alt.id}</span>
              <span className="text-slate-700">{alt.texto}</span>
            </button>
          )
        })}
      </div>

      {emRascunho && rascunho && (
        // Sem dizer QUAL alternativa foi marcada. A letra aqui era informação
        // repetida — a alternativa já está destacada em azul logo acima — e,
        // solta ao lado de um ícone de "escondido", passava a ler como se
        // fosse o gabarito. Num modo que existe justamente para não entregar a
        // resposta, uma letra ambígua já é entrega demais.
        //
        // O texto vai dentro de um <span> porque o <p> é flex: cada pedaço
        // solto virava um item do flex, e a frase se quebrava em colunas.
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Resposta marcada — dá pra trocar. Ela só é registrada quando você mandar corrigir.</span>
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
