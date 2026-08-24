import { AlertCircle, Check, Crown, Eye, EyeOff, KeyRound, Lock, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../lib/auth/AuthContext'
import { usingSupabase } from '../lib/repo'

export default function Perfil() {
  const { perfil, atualizarNome, salvarChaveGemini, alterarSenha } = useAuth()
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  const [chave, setChave] = useState(perfil?.chaveGemini ?? '')
  const [mostrarChave, setMostrarChave] = useState(false)
  const [salvandoChave, setSalvandoChave] = useState(false)
  const [erroChave, setErroChave] = useState<string | null>(null)
  const [erroNome, setErroNome] = useState<string | null>(null)

  // O perfil chega de forma assíncrona (e é recarregado depois de salvar),
  // então o valor inicial do useState pode ser o de antes. Sem isto, o campo
  // ficava vazio mesmo com a chave já gravada no banco.
  const chaveGravada = perfil?.chaveGemini ?? null
  useEffect(() => {
    setChave(chaveGravada ?? '')
  }, [chaveGravada])

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [mostrarSenhas, setMostrarSenhas] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [senhaTrocada, setSenhaTrocada] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)

  if (!perfil) return null

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErroSenha(null)
    setSenhaTrocada(false)

    // Conferidas aqui pra não gastar uma ida ao servidor com algo que a
    // própria tela já sabe que está errado.
    if (novaSenha.length < 6) {
      setErroSenha('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmaSenha) {
      setErroSenha('A confirmação não bate com a nova senha.')
      return
    }
    if (novaSenha === senhaAtual) {
      setErroSenha('A nova senha é igual à atual.')
      return
    }

    setTrocandoSenha(true)
    try {
      await alterarSenha(senhaAtual, novaSenha)
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmaSenha('')
      setSenhaTrocada(true)
    } catch (err) {
      setErroSenha(err instanceof Error ? err.message : 'Não foi possível trocar a senha.')
    } finally {
      setTrocandoSenha(false)
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setSalvo(false)
    setErroNome(null)
    try {
      await atualizarNome(nome)
      setSalvo(true)
    } catch (err) {
      // Antes o erro era engolido: o botão voltava pra "Salvar" e nada
      // acontecia, sem nenhuma pista do que deu errado.
      setErroNome(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarChave(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoChave(true)
    setErroChave(null)
    try {
      await salvarChaveGemini(chave.trim() || null)
    } catch (err) {
      // Este era o caso do relato "clico em salvar e não acontece nada":
      // quando o banco recusa (por exemplo, quando a migração 0008 ainda não
      // foi aplicada e a coluna chave_gemini não existe), o erro subia e era
      // descartado em silêncio. Agora ele aparece na tela.
      setErroChave(err instanceof Error ? err.message : 'Não foi possível salvar a chave.')
    } finally {
      setSalvandoChave(false)
    }
  }

  async function removerChave() {
    setSalvandoChave(true)
    setErroChave(null)
    try {
      await salvarChaveGemini(null)
      setChave('')
    } catch (err) {
      setErroChave(err instanceof Error ? err.message : 'Não foi possível remover a chave.')
    } finally {
      setSalvandoChave(false)
    }
  }

  return (
    <div className="max-w-md">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-lg font-bold text-white">
            {(perfil.nome.trim() || perfil.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy">{perfil.nome.trim() || 'Sem nome cadastrado'}</p>
            <p className="truncate text-sm text-slate-400">{perfil.email}</p>
          </div>
        </div>

        <div className="mb-4 flex gap-1.5">
          {perfil.isAdmin && (
            <span className="flex items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-1 text-xs font-bold text-white">
              <Shield className="h-3 w-3" strokeWidth={2} />
              Administrador
            </span>
          )}
          {perfil.isPremium && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
              <Crown className="h-3 w-3" strokeWidth={2} />
              Premium
            </span>
          )}
        </div>

        <form onSubmit={salvar}>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nome</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                setSalvo(false)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>
          {erroNome && (
            <p className="mb-2 flex items-start gap-1.5 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{erroNome}</span>
            </p>
          )}
          <Button type="submit" disabled={salvando || !nome.trim()}>
            {salvo ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2} />
                Salvo
              </>
            ) : salvando ? (
              'Salvando…'
            ) : (
              'Salvar'
            )}
          </Button>
        </form>
      </Card>

      <Card className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <Lock className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
          <h2 className="font-semibold text-navy">Trocar senha</h2>
        </div>
        <form onSubmit={trocarSenha}>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Senha atual</span>
            <input
              type={mostrarSenhas ? 'text' : 'password'}
              value={senhaAtual}
              onChange={(e) => {
                setSenhaAtual(e.target.value)
                setSenhaTrocada(false)
                setErroSenha(null)
              }}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nova senha</span>
            <input
              type={mostrarSenhas ? 'text' : 'password'}
              value={novaSenha}
              onChange={(e) => {
                setNovaSenha(e.target.value)
                setSenhaTrocada(false)
                setErroSenha(null)
              }}
              autoComplete="new-password"
              placeholder="Pelo menos 6 caracteres"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>
          <label className="mb-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Repita a nova senha</span>
            <input
              type={mostrarSenhas ? 'text' : 'password'}
              value={confirmaSenha}
              onChange={(e) => {
                setConfirmaSenha(e.target.value)
                setSenhaTrocada(false)
                setErroSenha(null)
              }}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>
          <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={mostrarSenhas} onChange={(e) => setMostrarSenhas(e.target.checked)} />
            Mostrar as senhas
          </label>

          {erroSenha && (
            <p className="mb-2 flex items-start gap-1.5 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{erroSenha}</span>
            </p>
          )}
          {senhaTrocada && (
            <p className="mb-2 flex items-start gap-1.5 text-sm text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <span>Senha alterada. Use a nova da próxima vez que entrar.</span>
            </p>
          )}

          <Button type="submit" disabled={trocandoSenha || !senhaAtual || !novaSenha || !confirmaSenha}>
            {trocandoSenha ? 'Trocando…' : 'Trocar senha'}
          </Button>
        </form>
      </Card>

      <Card className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
          <h2 className="font-semibold text-navy">Sua chave de IA (Gemini)</h2>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Opcional. O "PDF com IA" usa uma chave compartilhada por padrão, que pode ficar sobrecarregada em
          horários de pico. Colocando sua própria chave gratuita aqui, você passa a ter sua própria cota — sem
          fila com outros usuários. Leva uns 2 minutos: acesse{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-blue hover:underline"
          >
            aistudio.google.com/apikey
          </a>
          , faça login com uma conta Google e clique em "Create API key" (grátis, sem cartão).
        </p>
        {/* Fica visível enquanto a chave estiver gravada — inclusive depois de
            atualizar a página. O estado do botão sozinho não servia: ele
            voltava pra "Salvar" no primeiro recarregamento, e não dava pra
            saber se a chave tinha sido guardada ou não. */}
        {chaveGravada && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className="font-medium">Chave salva</p>
              <p className="text-emerald-700">
                O "PDF com IA" já está usando a sua cota, sem fila com outros usuários.
              </p>
              <button
                type="button"
                onClick={removerChave}
                disabled={salvandoChave}
                className="mt-1 font-medium text-emerald-800 underline hover:text-emerald-900 disabled:opacity-50"
              >
                Remover chave
              </button>
            </div>
          </div>
        )}

        <form onSubmit={salvarChave} className="flex items-end gap-2">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-600">Chave</span>
            <div className="relative">
              <input
                type={mostrarChave ? 'text' : 'password'}
                value={chave}
                onChange={(e) => {
                  setChave(e.target.value)
                  setErroChave(null)
                }}
                placeholder="AIza..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm outline-none focus:border-brand-blue"
              />
              <button
                type="button"
                onClick={() => setMostrarChave((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                aria-label={mostrarChave ? 'Esconder chave' : 'Mostrar chave'}
              >
                {mostrarChave ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
              </button>
            </div>
          </label>
          <Button type="submit" variant="secondary" disabled={salvandoChave || chave.trim() === (chaveGravada ?? '')} className="shrink-0">
            {salvandoChave ? (
              'Salvando…'
            ) : chave.trim() === (chaveGravada ?? '') && chaveGravada ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2} />
                Salva
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </form>
        {erroChave && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>{erroChave}</span>
          </p>
        )}
      </Card>

      <Card className="mt-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Diagnóstico técnico</p>
        <dl className="space-y-1 text-xs text-slate-500">
          <div className="flex justify-between gap-2">
            <dt>Backend</dt>
            <dd className="font-mono">{usingSupabase ? 'Supabase' : 'Local (sem Supabase)'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>ID do usuário</dt>
            <dd className="break-all font-mono">{perfil.userId}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>E-mail</dt>
            <dd className="font-mono">{perfil.email}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>isAdmin</dt>
            <dd className="font-mono">{String(perfil.isAdmin)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>isPremium</dt>
            <dd className="font-mono">{String(perfil.isPremium)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Versão do app</dt>
            <dd className="font-mono">
              {new Date(__INFO_BUILD__.data).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {__INFO_BUILD__.commit}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
