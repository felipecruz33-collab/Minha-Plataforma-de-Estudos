import {
  BarChart3,
  BookMarked,
  BookOpenCheck,
  Bot,
  Crown,
  Download,
  Home,
  ListChecks,
  Search,
  Sparkles,
  Star,
  Upload,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

/** Ordem fixa exigida pela Seção 5 do prompt original. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Início', icon: Home },
  { path: '/buscar', label: 'Buscar', icon: Search },
  { path: '/adicionar', label: 'Adicionar conteúdo', icon: Upload },
  { path: '/biblioteca', label: 'Biblioteca compartilhada', icon: BookMarked },
  { path: '/desempenho', label: 'Desempenho', icon: BarChart3 },
  { path: '/questoes', label: 'Questões', icon: BookOpenCheck },
  { path: '/simulados', label: 'Simulados', icon: ListChecks },
  { path: '/favoritos', label: 'Favoritos', icon: Star },
  { path: '/erradas', label: 'Questões erradas', icon: XCircle },
  { path: '/revisao', label: 'Revisão', icon: Sparkles },
  { path: '/backup', label: 'Backup', icon: Download },
  { path: '/geracoes', label: 'Gerações IA', icon: Bot },
  { path: '/premium', label: 'Premium', icon: Crown },
]

/** 14ª entrada, exclusiva do administrador — não conta como uma das 13 telas fixas. */
export const ADMIN_NAV_ITEM: NavItem = { path: '/usuarios', label: 'Usuários', icon: Users }
