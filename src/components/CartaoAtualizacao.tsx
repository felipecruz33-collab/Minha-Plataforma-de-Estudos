import { AlertCircle, AlertTriangle, Check, Eraser, RefreshCw, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { pareceEnderecoDePublicacao } from '../lib/enderecoDoApp'
import { aplicarAtualizacao, limparCacheDoApp, procurarAtualizacao } from '../lib/pwaUpdate'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { ConfirmDialog } from './ui/ConfirmDialog'

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'procurando' }
  | { tipo: 'atualizado' }
  | { tipo: 'aplicada' }
  | { tipo: 'limpando' }
  | { tipo: 'erro'; mensagem: string }

/**
 * Versão instalada, busca manual por atualização e a saída de emergência.
 *
 * O app já procura sozinho (ao voltar ao primeiro plano e a cada meia hora) e
 * avisa num rodapé quando acha. Esta tela existe pros casos em que isso não
 * basta — e todos eles já aconteceram de verdade neste app:
 *
 *  - a checagem automática não cair na hora em que a pessoa está olhando;
 *  - o conserto do próprio mecanismo de atualização estar DENTRO da versão que
 *    o cache não deixava chegar;
 *  - o app estar aberto num endereço de publicação da Vercel, que nunca muda.
 */
export function CartaoAtualizacao() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' })
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false)

  const host = typeof window !== 'undefined' ? window.location.host : ''
  const enderecoCongelado = pareceEnderecoDePublicacao(host)

  async function procurar() {
    setEstado({ tipo: 'procurando' })
    const resultado = await procurarAtualizacao()

    if (resultado === 'atualizado') {
      setEstado({ tipo: 'atualizado' })
      return
    }
    if (resultado === 'sem-suporte') {
      setEstado({
        tipo: 'erro',
        mensagem: 'Este navegador não guarda o app para uso offline, então ele já carrega sempre a versão mais recente.',
      })
      return
    }
    if (resultado === 'erro') {
      setEstado({ tipo: 'erro', mensagem: 'Não foi possível verificar agora. Confira sua conexão e tente de novo.' })
      return
    }

    // Achou versão nova: aplica sem recarregar, pra dar tempo de ler o aviso.
    try {
      await aplicarAtualizacao(false)
      setEstado({ tipo: 'aplicada' })
    } catch {
      setEstado({
        tipo: 'erro',
        mensagem: 'Encontramos uma versão nova, mas não foi possível aplicá-la. Feche o aplicativo e abra de novo.',
      })
    }
  }

  async function limpar() {
    setConfirmandoLimpeza(false)
    setEstado({ tipo: 'limpando' })
    await limparCacheDoApp()
  }

  const versao = new Date(__INFO_BUILD__.data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
        <h2 className="font-semibold text-navy">Versão do aplicativo</h2>
      </div>

      <p className="mb-1 text-sm text-slate-500">
        Você está usando a versão de <span className="font-mono text-slate-600">{versao}</span>.
      </p>
      <p className="mb-3 text-xs text-slate-400">
        Endereço: <span className="break-all font-mono">{host}</span>
      </p>

      {enderecoCongelado && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="font-semibold">Este endereço não recebe atualizações</p>
            <p className="mt-0.5 text-amber-800">
              Ele aponta para uma publicação específica e vai continuar mostrando esta versão para sempre — fechar o
              app ou limpar o cache não resolve. Abra o endereço oficial (o mesmo, mas <strong>sem</strong> o código
              no meio) e salve esse na tela inicial.
            </p>
          </div>
        </div>
      )}

      {estado.tipo === 'aplicada' ? (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="font-semibold">Atualização baixada</p>
            <p className="mt-0.5 text-emerald-700">
              Feche o aplicativo por completo e abra de novo para finalizar. No celular, feche pela lista de apps
              recentes; no computador, feche todas as abas do app.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 font-semibold text-emerald-800 underline hover:text-emerald-900"
            >
              Ou recarregue agora
            </button>
          </div>
        </div>
      ) : (
        <>
          <Button variant="secondary" onClick={procurar} disabled={estado.tipo === 'procurando' || estado.tipo === 'limpando'}>
            <RefreshCw className={`h-4 w-4 ${estado.tipo === 'procurando' ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            {estado.tipo === 'procurando' ? 'Procurando…' : 'Procurar atualização'}
          </Button>

          {estado.tipo === 'atualizado' && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <span>O aplicativo já está atualizado.</span>
            </p>
          )}

          {estado.tipo === 'erro' && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{estado.mensagem}</span>
            </p>
          )}
        </>
      )}

      {/* Saída de emergência: fica discreta de propósito, porque quase nunca é
          o caminho certo — mas quando é, não ter deixa a pessoa presa. */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setConfirmandoLimpeza(true)}
          disabled={estado.tipo === 'limpando'}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy disabled:opacity-50"
        >
          <Eraser className="h-4 w-4" strokeWidth={1.75} />
          {estado.tipo === 'limpando' ? 'Limpando…' : 'Continua na versão antiga? Limpar e recarregar'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmandoLimpeza}
        title="Limpar os arquivos guardados do app?"
        description="Apaga a cópia offline do aplicativo e busca tudo de novo no servidor. Suas matérias, aulas, questões, respostas e a chave de IA NÃO são afetadas."
        // Sem isto o botão diria "Excluir" (o padrão do diálogo), o que assusta
        // à toa numa ação que não apaga conteúdo nenhum.
        confirmLabel="Limpar e recarregar"
        confirmVariant="primary"
        onConfirm={limpar}
        onCancel={() => setConfirmandoLimpeza(false)}
      />
    </Card>
  )
}
