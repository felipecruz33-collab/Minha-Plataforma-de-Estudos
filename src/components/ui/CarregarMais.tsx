import { Button } from './Button'

interface CarregarMaisProps {
  mostrando: number
  total: number
  temMais: boolean
  onVerMais: () => void
}

/**
 * Rodapé de uma lista paginada.
 *
 * Botão em vez de rolagem infinita: é previsível, funciona com teclado, não
 * briga com o navegador quando a pessoa volta para a tela — e a contagem
 * ("20 de 340") responde sozinha a "será que o filtro pegou tudo?".
 */
export function CarregarMais({ mostrando, total, temMais, onVerMais }: CarregarMaisProps) {
  if (!temMais) return null
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-sm text-slate-400">
        Mostrando {mostrando} de {total}
      </p>
      <Button variant="secondary" onClick={onVerMais}>
        Carregar mais
      </Button>
    </div>
  )
}
