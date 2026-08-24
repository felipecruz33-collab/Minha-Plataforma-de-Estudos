import { forwardRef, type HTMLAttributes } from 'react'

// Encaminha a ref pro <div> real. Necessário porque a lista de aulas precisa
// medir a posição de cada card durante o arraste (MateriaDetail); sem isso, no
// React 18, a ref simplesmente não chega ao elemento.
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className = '', ...props },
  ref,
) {
  return <div ref={ref} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`} {...props} />
})
