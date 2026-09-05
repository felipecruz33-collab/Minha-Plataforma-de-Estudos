import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginacaoProps {
  pagina: number
  totalPaginas: number
  de: number
  ate: number
  total: number
  onIr: (pagina: number) => void
  /** O rótulo do que está sendo contado ("questões", "aulas"). */
  rotulo?: string
}

/**
 * Quantos números contíguos ficam à mostra em volta da página atual.
 *
 * Cinco, e não três: com três, quem está na página 1 de 20 só conseguia pular
 * para a 2 ou para a 20 — para chegar na 3 tinha que usar a seta. O ponto de
 * ter número é justamente escolher o destino.
 */
const JANELA = 5

/**
 * Quais números cabem na barra.
 *
 * Sempre a primeira, a última e uma faixa contígua em volta da atual. O "…" só
 * entra quando esconde MAIS DE UMA página: pôr reticências no lugar de uma
 * página só troca um número clicável por um enfeite, e ainda ocupa o mesmo
 * espaço.
 */
function paginasVisiveis(pagina: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  // A faixa gruda no começo ou no fim quando a página atual está perto de uma
  // das pontas, para continuar mostrando cinco números em vez de três.
  const fim = Math.min(total, Math.max(1, pagina - 2) + JANELA - 1)
  const inicio = Math.max(1, fim - JANELA + 1)
  const faixa = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)

  const marcos = [...new Set([1, total, ...faixa])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)

  const saida: (number | '…')[] = []
  let anterior = 0
  for (const n of marcos) {
    if (n === anterior) continue
    if (anterior && n - anterior === 2) saida.push(anterior + 1)
    else if (anterior && n - anterior > 2) saida.push('…')
    saida.push(n)
    anterior = n
  }
  return saida
}

const setaCls =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-default'

export function Paginacao({ pagina, totalPaginas, de, ate, total, onIr, rotulo = 'questões' }: PaginacaoProps) {
  // Uma página só não é paginação — é uma lista.
  if (totalPaginas <= 1) return null

  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-center gap-2 py-3">
      <button
        type="button"
        onClick={() => onIr(pagina - 1)}
        disabled={pagina === 1}
        aria-label="Página anterior"
        className={setaCls}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
      </button>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {paginasVisiveis(pagina, totalPaginas).map((n, i) =>
          n === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-slate-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onIr(n)}
              aria-label={`Página ${n}`}
              aria-current={n === pagina ? 'page' : undefined}
              className={`h-9 min-w-9 rounded-lg px-1.5 text-sm font-semibold ${
                n === pagina ? 'bg-brand-blue text-white' : 'border border-slate-300 text-slate-600'
              }`}
            >
              {n}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={() => onIr(pagina + 1)}
        disabled={pagina === totalPaginas}
        aria-label="Próxima página"
        className={setaCls}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
      </button>

      {/* A conta por extenso responde sozinha a "o filtro pegou tudo mesmo?" —
          é a mesma função que o "mostrando 20 de 340" tinha antes. */}
      <p className="w-full text-center text-xs text-slate-400">
        {de}–{ate} de {total} {rotulo}
      </p>
    </nav>
  )
}
