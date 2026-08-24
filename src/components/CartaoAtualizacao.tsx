import { AlertCircle, Check, RefreshCw, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { aplicarAtualizacao, procurarAtualizacao } from '../lib/pwaUpdate'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'procurando' }
  | { tipo: 'atualizado' }
  | { tipo: 'aplicada' }
  | { tipo: 'erro'; mensagem: string }

/**
 * Busca manual por versão nova.
 *
 * O app já procura sozinho (ao voltar ao primeiro plano e a cada meia hora),
 * e avisa num rodapé quando acha. Este botão existe pro caso em que isso não
 * basta — e ele aconteceu de verdade: o conserto do próprio mecanismo de
 * atualização estava DENTRO da versão que o cache não deixava chegar, e a
 * única saída era mexer nas ferramentas do desenvolvedor do navegador.
 *
 * Depois de aplicar, a orientação é fechar e abrir o app em vez de só
 * recarregar. Recarregar resolve na maioria das vezes (e o botão pra isso
 * está ali), mas no app instalado na tela inicial a casca da página pode ficar
 * guardada pelo próprio sistema — fechar de vez é o que garante.
 */
export function CartaoAtualizacao() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' })

  async function procurar() {
    setEstado({ tipo: 'procurando' })
    const resultado = await procurarAtualizacao()

    if (resultado === 'atualizado') {
      setEstado({ tipo: 'atualizado' })
      return
    }
    if (resultado === 'sem-suporte') {
      setEstado({ tipo: 'erro', mensagem: 'Este navegador não guarda o app para uso offline, então ele já carrega sempre a versão mais recente.' })
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
      setEstado({ tipo: 'erro', mensagem: 'Encontramos uma versão nova, mas não foi possível aplicá-la. Feche o aplicativo e abra de novo.' })
    }
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

      <p className="mb-3 text-sm text-slate-500">
        Você está usando a versão de <span className="font-mono text-slate-600">{versao}</span>. O app procura
        atualizações sozinho, mas você pode forçar a busca aqui.
      </p>

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
          <Button variant="secondary" onClick={procurar} disabled={estado.tipo === 'procurando'}>
            <RefreshCw
              className={`h-4 w-4 ${estado.tipo === 'procurando' ? 'animate-spin' : ''}`}
              strokeWidth={1.75}
            />
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
    </Card>
  )
}
