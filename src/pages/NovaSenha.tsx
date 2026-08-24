import { AlertCircle, Check, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { useAuth } from '../lib/auth/AuthContext'

/**
 * Tela que o link do e-mail de recuperação abre.
 *
 * O link traz uma sessão temporária no próprio endereço, e o cliente do
 * Supabase entra com ela sozinho ao carregar a página — por isso aqui só
 * pedimos a senha nova, sem pedir a antiga (quem esqueceu a antiga é
 * justamente quem está aqui).
 *
 * Se a pessoa abrir este endereço sem vir do e-mail, ou com um link já usado
 * ou vencido, não há sessão: em vez de mostrar um formulário que vai falhar,
 * a tela explica e manda pedir um link novo.
 */
export default function NovaSenha() {
  const { user, loading, definirNovaSenha } = useAuth()
  const navigate = useNavigate()

  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!pronto) return
    // Dá tempo de ler a confirmação antes de sair da tela.
    const t = setTimeout(() => navigate('/', { replace: true }), 2500)
    return () => clearTimeout(t)
  }, [pronto, navigate])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('A confirmação não bate com a nova senha.')
      return
    }

    setSalvando(true)
    try {
      await definirNovaSenha(senha)
      setPronto(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar a nova senha.')
    } finally {
      setSalvando(false)
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

      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {loading ? (
          <p className="text-sm text-slate-400">Conferindo o link…</p>
        ) : pronto ? (
          <div className="flex items-start gap-2 text-sm text-emerald-800">
            <Check className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-semibold">Senha alterada</p>
              <p className="mt-0.5 text-emerald-700">Levando você para o app…</p>
            </div>
          </div>
        ) : !user ? (
          <>
            <h1 className="mb-1 text-lg font-bold text-navy">Link expirado ou já usado</h1>
            <p className="mb-5 text-sm text-slate-500">
              Cada link vale por pouco tempo e por uma vez só. Peça um novo na tela de login, em "Esqueci minha
              senha".
            </p>
            <Link to="/login">
              <Button className="w-full">Voltar para o login</Button>
            </Link>
          </>
        ) : (
          <form onSubmit={salvar}>
            <div className="mb-1 flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
              <h1 className="text-lg font-bold text-navy">Criar senha nova</h1>
            </div>
            <p className="mb-5 text-sm text-slate-500">
              Conta: <span className="break-all font-medium text-slate-600">{user.email}</span>
            </p>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Nova senha</span>
              <input
                type={mostrar ? 'text' : 'password'}
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value)
                  setErro(null)
                }}
                autoComplete="new-password"
                placeholder="Pelo menos 6 caracteres"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
              />
            </label>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Repita a nova senha</span>
              <input
                type={mostrar ? 'text' : 'password'}
                value={confirma}
                onChange={(e) => {
                  setConfirma(e.target.value)
                  setErro(null)
                }}
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
              />
            </label>

            <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
              Mostrar as senhas
            </label>

            {erro && (
              <p className="mb-3 flex items-start gap-1.5 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{erro}</span>
              </p>
            )}

            <Button type="submit" disabled={salvando || !senha || !confirma} className="w-full">
              {salvando ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
