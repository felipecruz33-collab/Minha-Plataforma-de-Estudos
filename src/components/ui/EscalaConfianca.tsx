import type { Confianca } from '../../lib/types'

/**
 * Três graus, e não cinco nem um controle deslizante.
 *
 * O que o app precisa distinguir é só isto: foi sorte, foi recuperação com
 * esforço, ou foi certeza. Mais graus do que isso a pessoa não consegue
 * aplicar com consistência — e grau aplicado sem consistência estraga o dado
 * que a escada de revisão vai usar.
 */
export const GRAUS: { valor: Confianca; rotulo: string; classe: string; classeAtiva: string }[] = [
  {
    valor: 'chute',
    rotulo: 'Chutei',
    classe: 'border-slate-300 text-slate-600 hover:border-slate-400',
    classeAtiva: 'border-slate-500 bg-slate-100 text-slate-800',
  },
  {
    valor: 'duvida',
    rotulo: 'Em dúvida',
    classe: 'border-amber-300 text-amber-700 hover:border-amber-400',
    classeAtiva: 'border-amber-500 bg-amber-50 text-amber-800',
  },
  {
    valor: 'certeza',
    rotulo: 'Tenho certeza',
    classe: 'border-emerald-300 text-emerald-700 hover:border-emerald-400',
    classeAtiva: 'border-emerald-500 bg-emerald-50 text-emerald-800',
  },
]

export function EscalaConfianca({
  valor,
  onEscolher,
  titulo = 'O quanto você tem certeza?',
  ajuda,
}: {
  valor?: Confianca | null
  onEscolher: (c: Confianca) => void
  titulo?: string
  ajuda?: string
}) {
  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
      <p className="text-xs font-semibold text-navy">{titulo}</p>
      {ajuda && <p className="mt-0.5 text-[11px] text-slate-500">{ajuda}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {GRAUS.map((g) => (
          <button
            key={g.valor}
            type="button"
            onClick={() => onEscolher(g.valor)}
            aria-pressed={valor === g.valor}
            className={`min-w-0 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold ${
              valor === g.valor ? g.classeAtiva : g.classe
            }`}
          >
            {g.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Etiqueta curta do grau, para listas e extratos. */
export function rotuloConfianca(c: Confianca | null | undefined): string {
  return GRAUS.find((g) => g.valor === c)?.rotulo ?? ''
}
