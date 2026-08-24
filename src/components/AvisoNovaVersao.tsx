import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { aplicarAtualizacao, assinarAtualizacao } from '../lib/pwaUpdate'

/**
 * Aviso de nova versão disponível.
 *
 * Fica fixo no rodapé porque o app é usado no celular com uma barra inferior
 * — aparecer no topo competiria com o cabeçalho e sumiria ao rolar a página.
 *
 * Não tem botão de fechar de propósito: quem quiser continuar no que estava
 * fazendo é só ignorar, e a versão nova entra sozinha na próxima vez que o
 * app for aberto. Um "X" daria a impressão de que dá pra recusar a
 * atualização, o que não é verdade nem seria bom.
 */
export function AvisoNovaVersao() {
  const [temAtualizacao, setTemAtualizacao] = useState(false)
  const [atualizando, setAtualizando] = useState(false)

  useEffect(() => assinarAtualizacao(setTemAtualizacao), [])

  if (!temAtualizacao) return null

  return (
    <div
      role="status"
      // O anel claro não é enfeite: a tela de login tem o mesmo azul-escuro do
      // aviso, e sem ele o cartão desaparece no fundo.
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl bg-navy p-3 text-white shadow-xl ring-1 ring-white/25 sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <RefreshCw className={`h-5 w-5 shrink-0 ${atualizando ? 'animate-spin' : ''}`} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Nova versão disponível</p>
        <p className="text-xs text-slate-300">Atualize para receber as melhorias mais recentes.</p>
      </div>
      <button
        type="button"
        onClick={() => {
          setAtualizando(true)
          aplicarAtualizacao()
        }}
        disabled={atualizando}
        className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-bold text-navy hover:bg-slate-100 disabled:opacity-60"
      >
        {atualizando ? 'Atualizando…' : 'Atualizar'}
      </button>
    </div>
  )
}
