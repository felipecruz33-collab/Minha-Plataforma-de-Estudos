import { AlertTriangle, Ban, BookOpen, CheckCircle2, Lightbulb, Search, Table2, type LucideIcon } from 'lucide-react'
import type { TipoBloco } from './types'

export const TIPO_BLOCO_ICON: Record<TipoBloco, LucideIcon> = {
  texto: BookOpen,
  dica: BookOpen,
  alerta: AlertTriangle,
  memorize: CheckCircle2,
  exemplo: Lightbulb,
  palavra: Search,
  naoconfunda: Ban,
  tabela: Table2,
}

/** Cor do ícone da aba quando inativa — precisa ser classe literal (Tailwind escaneia texto, não interpolação). */
export const TIPO_BLOCO_ICON_COR: Record<TipoBloco, string> = {
  texto: 'text-navy',
  dica: 'text-blue-500',
  alerta: 'text-amber-500',
  memorize: 'text-emerald-500',
  exemplo: 'text-indigo-500',
  palavra: 'text-purple-500',
  naoconfunda: 'text-rose-500',
  tabela: 'text-slate-500',
}
