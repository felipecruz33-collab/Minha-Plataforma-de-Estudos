import { AlertCircle, ArrowLeft, Download, MailCheck, Share } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { useAuth } from '../lib/auth/AuthContext'
import type { ResultadoEnvio } from '../lib/auth/recuperacaoSenha'
import { usePwaInstall } from '../lib/hooks/usePwaInstall'

export default function Login() {
  const { user, signIn, signUp, enviarLinkDeSenha } = useAuth()
  const { canInstall, showIOSInstructions, install } = usePwaInstall()
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [recuperacao, setRecuperacao] = useState<ResultadoEnvio | null>(null)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    setRecuperacao(null)
    try {
      if (modo === 'recuperar') setRecuperacao(await enviarLinkDeSenha(email))
      else if (modo === 'entrar') await signIn(email, senha)
      else await signUp(email, senha, nome)
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

      {canInstall && (
        <Button
          type="button"
          variant="secondary"
          onClick={install}
          className="mb-6 w-full max-w-sm !bg-white/10 !text-white hover:!bg-white/20"
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
          Baixar aplicativo
        </Button>
      )}

      {showIOSInstructions && (
        <p className="mb-6 flex w-full max-w-sm items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-xs text-slate-300">
          <Share className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          Pra instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início"
        </p>
      )}

      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-lg font-bold text-navy">
          {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Recuperar acesso'}
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          {modo === 'recuperar'
            ? 'Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.'
            : 'Login obrigatório para acessar sua biblioteca de estudos.'}
        </p>

        {modo === 'criar' && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nome</span>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
              autoComplete="name"
            />
          </label>
        )}

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

        <label className={`mb-4 block text-sm ${modo === 'recuperar' ? 'hidden' : ''}`}>
          <span className="mb-1 block font-medium text-slate-600">Senha</span>
          <input
            type="password"
            required={modo !== 'recuperar'}
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </label>

        {erro && <p className="mb-4 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{erro}</p>}

        {recuperacao?.tipo === 'enviado' && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              Link enviado para <strong className="break-all">{email}</strong>. Abra o e-mail e toque no link para
              criar uma senha nova — confira também a caixa de spam.
            </span>
          </div>
        )}
        {recuperacao?.tipo === 'nao-cadastrado' && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              Este e-mail não está cadastrado. Confira se digitou certo, ou{' '}
              <button type="button" onClick={() => setModo('criar')} className="font-semibold underline">
                crie uma conta
              </button>
              .
            </span>
          </div>
        )}
        {recuperacao?.tipo === 'indisponivel' && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Recuperação por e-mail só funciona no app publicado, com o servidor conectado.
          </div>
        )}
        {recuperacao?.tipo === 'erro' && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{recuperacao.mensagem}</div>
        )}

        <Button type="submit" disabled={carregando} className="w-full">
          {carregando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
        </Button>

        {modo === 'entrar' && (
          <button
            type="button"
            onClick={() => {
              setModo('recuperar')
              setErro(null)
              setRecuperacao(null)
            }}
            className="mt-3 w-full text-center text-sm text-slate-500 hover:text-navy hover:underline"
          >
            Esqueci minha senha
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setModo(modo === 'criar' ? 'entrar' : modo === 'recuperar' ? 'entrar' : 'criar')
            setErro(null)
            setRecuperacao(null)
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 text-center text-sm text-brand-indigo hover:underline"
        >
          {modo === 'recuperar' && <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />}
          {modo === 'entrar' ? 'Não tem conta? Criar agora' : modo === 'criar' ? 'Já tem conta? Entrar' : 'Voltar para o login'}
        </button>
      </form>
    </div>
  )
}
