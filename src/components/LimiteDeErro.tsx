import { AlertTriangle } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { limparCacheDoApp } from '../lib/pwaUpdate'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
  /** Muda quando a pessoa navega, pra sair sozinho do erro ao trocar de tela. */
  chave?: string
}

interface State {
  erro: Error | null
}

/**
 * Impede que um erro numa tela derrube o aplicativo inteiro.
 *
 * Sem isto, qualquer exceção durante a renderização — um dado inesperado
 * vindo do banco, um campo nulo onde o código esperava texto — apaga a árvore
 * do React e deixa a tela em branco. Num app instalado no celular isso é pior
 * do que numa aba: não há barra de endereço para digitar outro caminho, e a
 * pessoa fica sem saída dentro de uma tela branca. O jeito de sair vira
 * desinstalar.
 *
 * Aqui o erro fica contido na área de conteúdo: o menu continua funcionando,
 * e trocar de tela limpa o estado sozinho (é o que a `chave` faz).
 */
export class LimiteDeErro extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidUpdate(anterior: Props) {
    if (this.state.erro && anterior.chave !== this.props.chave) {
      this.setState({ erro: null })
    }
  }

  componentDidCatch(erro: Error) {
    // Sem serviço de monitoramento ainda: o console é o que sobra pra
    // conseguir diagnosticar quando alguém mandar um print.
    console.error('[app] erro na tela:', erro)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" strokeWidth={1.75} />
        <h1 className="mb-1 text-lg font-bold text-navy">Esta tela travou</h1>
        <p className="mb-5 text-sm text-slate-500">
          O resto do aplicativo continua funcionando — use o menu para ir a outra tela. Se acontecer de novo na
          mesma tela, recarregar costuma resolver.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
          <Button variant="secondary" onClick={() => limparCacheDoApp()}>
            Limpar e recarregar
          </Button>
        </div>
        <p className="mt-5 break-words text-xs text-slate-400">{this.state.erro.message}</p>
      </div>
    )
  }
}
