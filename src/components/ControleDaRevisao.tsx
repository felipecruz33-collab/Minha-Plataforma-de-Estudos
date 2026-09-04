import { Pause, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'

/**
 * Pausar, retomar e recomeçar o ciclo de revisão.
 *
 * Aparece igual em "Questões erradas" e em "Revisão" porque o ciclo é o mesmo —
 * duas telas do mesmo relógio. Dois botões, duas necessidades diferentes:
 *
 * - PAUSAR é para quem vai parar um tempo. Enquanto pausado nada vence, e ao
 *   voltar os prazos recontam a partir do dia da volta em vez de despejar
 *   semanas de atraso de uma vez. O degrau que a pessoa já subiu na escada é
 *   preservado: ela não perde o progresso, só o relógio para.
 * - RECOMEÇAR é para quem mudou de concurso. O ciclo zera, mas NADA é apagado:
 *   as respostas continuam no banco e o Desempenho continua contando tudo. O
 *   que muda é só o que volta a cobrar revisão daqui pra frente.
 */
export function ControleDaRevisao({ onMudou }: { onMudou?: () => void }) {
  const { perfil, refreshPerfil } = useAuth()
  const [salvando, setSalvando] = useState(false)
  const [confirmarRecomeco, setConfirmarRecomeco] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ciclo = perfil?.revisao ?? { pausadaEm: null, retomadaEm: null, reinicio: null }
  const pausado = !!ciclo.pausadaEm

  async function salvar(novo: typeof ciclo) {
    if (!perfil) return
    setSalvando(true)
    setErro(null)
    try {
      await repo.salvarCicloRevisao(perfil.userId, novo)
      await refreshPerfil()
      onMudou?.()
    } catch {
      // Causa mais provável: a migração 0017 ainda não foi aplicada no banco.
      setErro('Não foi possível salvar. Tente de novo em instantes.')
    } finally {
      setSalvando(false)
      setConfirmarRecomeco(false)
    }
  }

  const agora = () => new Date().toISOString()

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {pausado ? (
            <>
              <strong className="text-amber-700">Revisão pausada.</strong> Nada vence enquanto isso — ao voltar, os prazos
              recomeçam a contar do dia da volta.
            </>
          ) : (
            <>
              Vai parar um tempo ou trocar de concurso? Dá para <strong className="text-navy">pausar</strong> o ciclo sem
              acumular atraso.
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          {pausado ? (
            <Button
              onClick={() => salvar({ ...ciclo, pausadaEm: null, retomadaEm: agora() })}
              disabled={salvando}
              className="px-3 py-1.5 text-xs"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2} />
              Retomar
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => salvar({ ...ciclo, pausadaEm: agora() })}
              disabled={salvando}
              className="px-3 py-1.5 text-xs"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={2} />
              Pausar
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setConfirmarRecomeco(true)}
            disabled={salvando}
            className="px-3 py-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Recomeçar
          </Button>
        </div>
      </div>
      {erro && <p className="mt-2 text-xs text-rose-600">{erro}</p>}

      <ConfirmDialog
        open={confirmarRecomeco}
        title="Recomeçar a revisão do zero?"
        description="O ciclo zera: nada fica pendente e as questões voltam a entrar só a partir dos próximos erros. Nenhuma resposta é apagada — o seu histórico e as estatísticas de desempenho continuam inteiros. Serve para quem está começando a estudar para outro concurso."
        confirmLabel="Recomeçar"
        onConfirm={() => salvar({ pausadaEm: null, retomadaEm: null, reinicio: agora() })}
        onCancel={() => setConfirmarRecomeco(false)}
      />
    </div>
  )
}
