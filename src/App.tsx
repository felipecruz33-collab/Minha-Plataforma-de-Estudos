import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AuthProvider, useAuth } from './lib/auth/AuthContext'
import Adicionar from './pages/Adicionar'
import AulaDetail from './pages/AulaDetail'
import Backup from './pages/Backup'
import Biblioteca from './pages/Biblioteca'
import Buscar from './pages/Buscar'
import Cronograma from './pages/Cronograma'
import Desempenho from './pages/Desempenho'
import Erradas from './pages/Erradas'
import Favoritos from './pages/Favoritos'
import Geracoes from './pages/Geracoes'
import Inicio from './pages/Inicio'
import Login from './pages/Login'
import MateriaDetail from './pages/MateriaDetail'
import Perfil from './pages/Perfil'
import Premium from './pages/Premium'
import Questoes from './pages/Questoes'
import Revisao from './pages/Revisao'
import Simulados from './pages/Simulados'
import Usuarios from './pages/Usuarios'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy">
        <p className="text-sm text-slate-400">Carregando…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Inicio />} />
        <Route path="/materias/:materiaId" element={<MateriaDetail />} />
        <Route path="/aulas/:aulaId" element={<AulaDetail />} />
        <Route path="/buscar" element={<Buscar />} />
        <Route path="/adicionar" element={<Adicionar />} />
        <Route path="/biblioteca" element={<Biblioteca />} />
        <Route path="/biblioteca/:materiaId" element={<MateriaDetail />} />
        <Route path="/cronograma" element={<Cronograma />} />
        <Route path="/desempenho" element={<Desempenho />} />
        <Route path="/questoes" element={<Questoes />} />
        <Route path="/simulados" element={<Simulados />} />
        <Route path="/favoritos" element={<Favoritos />} />
        <Route path="/erradas" element={<Erradas />} />
        <Route path="/revisao" element={<Revisao />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="/geracoes" element={<Geracoes />} />
        <Route path="/premium" element={<Premium />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/perfil" element={<Perfil />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
