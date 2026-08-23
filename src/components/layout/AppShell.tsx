import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/nav'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const current = NAV_ITEMS.find((item) => (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)))

  return (
    <div className="min-h-screen bg-white lg:flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={current?.label ?? 'Minha Plataforma de Estudos'} icon={current?.icon} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 bg-white px-4 py-5 pb-24 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
