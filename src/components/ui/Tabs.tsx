import type { LucideIcon } from 'lucide-react'

interface TabItem {
  key: string
  label: string
  icon?: LucideIcon
  iconColorClass?: string
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  variant?: 'underline' | 'pill'
}

export function Tabs({ tabs, active, onChange, variant = 'underline' }: TabsProps) {
  if (variant === 'pill') {
    return (
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-navy bg-navy text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {Icon && <Icon className={`h-4 w-4 ${isActive ? 'text-white' : tab.iconColorClass ?? 'text-slate-400'}`} strokeWidth={2} />}
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
            active === tab.key
              ? 'border-brand-blue text-navy'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
