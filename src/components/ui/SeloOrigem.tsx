import { BookMarked, User } from 'lucide-react'

/**
 * Carimbo de origem da matéria.
 *
 * Fica ao lado do nome onde a lista não tem como ser dividida em seções — no
 * cabeçalho de um cartão, numa linha de tarefa. Discreto de propósito: é uma
 * informação, não um alerta.
 */
export function SeloOrigem({ isBiblioteca }: { isBiblioteca: boolean }) {
  const Icone = isBiblioteca ? BookMarked : User
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isBiblioteca ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      <Icone className="h-3 w-3" strokeWidth={2} />
      {isBiblioteca ? 'Biblioteca' : 'Minha'}
    </span>
  )
}
