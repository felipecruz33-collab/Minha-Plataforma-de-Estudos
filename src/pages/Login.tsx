import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { useAuth } from '../lib/auth/AuthContext'

export default function Login() {
  const { user, signIn, signUp } = useAuth()
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      if (modo === 'entrar') await signIn(email, senha)
      else await signUp(email, senha)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível continuar.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-10">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo className="h-14 w-14" />
        <div className="text-center">
          <p className="text-lg font-bold text-white">Minha Plataforma</p>
          <p className="text-sm text-slate-400">de Estudos</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-lg font-bold text-navy">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mb-5 text-sm text-slate-500">Login obrigatório para acessar sua biblioteca de estudos.</p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-slate-600">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            autoComplete="email"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Senha</span>
          <input
            type="password"
            required
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </label>

        {erro && <p className="mb-4 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{erro}</p>}

        <Button type="submit" disabled={carregando} className="w-full">
          {carregando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </Button>

        <button
          type="button"
          onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}
          className="mt-4 w-full text-center text-sm text-brand-indigo hover:underline"
        >
          {modo === 'entrar' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  )
}
