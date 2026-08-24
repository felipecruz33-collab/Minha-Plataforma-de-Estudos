import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { repo } from '../repo'
import { isSupabaseConfigured, supabase } from '../supabaseClient'
import type { Perfil } from '../types'
import * as localAuth from './localAuth'

interface AuthContextValue {
  loading: boolean
  user: { id: string; email: string } | null
  perfil: Perfil | null
  signUp: (email: string, password: string, nome: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshPerfil: () => Promise<void>
  toggleFavorito: (questaoId: string) => Promise<void>
  atualizarNome: (nome: string) => Promise<void>
  salvarChaveGemini: (chave: string | null) => Promise<void>
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  const loadPerfil = useCallback(async (u: { id: string; email: string }) => {
    const p = await repo.getPerfil(u.id, u.email)
    setPerfil(p)
  }, [])

  useEffect(() => {
    let mounted = true

    async function init() {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession()
        const sessionUser = data.session?.user
        if (sessionUser && mounted) {
          const u = { id: sessionUser.id, email: sessionUser.email ?? '' }
          setUser(u)
          await loadPerfil(u)
        }
        supabase.auth.onAuthStateChange(async (_event, session) => {
          if (!mounted) return
          if (session?.user) {
            const u = { id: session.user.id, email: session.user.email ?? '' }
            setUser(u)
            await loadPerfil(u)
          } else {
            setUser(null)
            setPerfil(null)
          }
        })
      } else {
        const session = localAuth.getSession()
        if (session && mounted) {
          setUser(session)
          await loadPerfil(session)
        }
      }
      if (mounted) setLoading(false)
    }

    init()
    return () => {
      mounted = false
    }
  }, [loadPerfil])

  const signUp = useCallback(
    async (email: string, password: string, nome: string) => {
      let u: { id: string; email: string } | null = null
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Sem sessão de verdade = o projeto exige confirmação por e-mail e a
        // conta ainda não foi confirmada. NÃO loga localmente aqui: fazer
        // isso deixaria a tela parecer "logada" sem nenhuma sessão real, e
        // toda leitura protegida por RLS falharia silenciosamente — a pessoa
        // sairia/atualizaria a página, perderia esse estado falso, e ia
        // parecer que a conta nunca existiu.
        if (!data.session) {
          throw new Error(
            'Conta criada! Falta confirmar seu e-mail — abrimos um link de confirmação pra você (confira também a caixa de spam) antes de conseguir entrar.',
          )
        }
        u = { id: data.session.user.id, email: data.session.user.email ?? email }
      } else {
        u = localAuth.signUp(email, password)
      }
      if (!u) return
      setUser(u)
      await loadPerfil(u)
      if (nome.trim()) {
        const p = await repo.atualizarNome(u.id, nome.trim())
        setPerfil(p)
      }
    },
    [loadPerfil],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          if (error.code === 'email_not_confirmed') {
            throw new Error('Falta confirmar seu e-mail antes de entrar — veja o link que mandamos (confira também a caixa de spam).')
          }
          throw error
        }
        if (data.user) {
          const u = { id: data.user.id, email: data.user.email ?? email }
          setUser(u)
          await loadPerfil(u)
        }
      } else {
        const session = localAuth.signIn(email, password)
        setUser(session)
        await loadPerfil(session)
      }
    },
    [loadPerfil],
  )

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut()
    } else {
      localAuth.signOut()
    }
    setUser(null)
    setPerfil(null)
  }, [])

  const refreshPerfil = useCallback(async () => {
    if (user) await loadPerfil(user)
  }, [user, loadPerfil])

  const toggleFavorito = useCallback(
    async (questaoId: string) => {
      if (!user) return
      const p = await repo.toggleFavorito(user.id, questaoId)
      setPerfil(p)
    },
    [user],
  )

  const atualizarNome = useCallback(
    async (nome: string) => {
      if (!user) return
      const p = await repo.atualizarNome(user.id, nome.trim())
      setPerfil(p)
    },
    [user],
  )

  const salvarChaveGemini = useCallback(
    async (chave: string | null) => {
      if (!user) return
      const p = await repo.salvarChaveGemini(user.id, chave)
      setPerfil(p)
    },
    [user],
  )

  const alterarSenha = useCallback(
    async (senhaAtual: string, novaSenha: string) => {
      if (!user) throw new Error('Você precisa estar logado.')

      if (isSupabaseConfigured && supabase) {
        // O Supabase troca a senha só com a sessão ativa, sem pedir a atual.
        // Conferimos a atual de propósito: um celular esquecido desbloqueado,
        // ou uma sessão deixada aberta num computador emprestado, viraria
        // sequestro de conta em dois toques — e a pessoa perderia o acesso.
        const { error: erroSenha } = await supabase.auth.signInWithPassword({ email: user.email, password: senhaAtual })
        if (erroSenha) throw new Error('A senha atual está incorreta.')

        const { error } = await supabase.auth.updateUser({ password: novaSenha })
        if (error) throw error
      } else {
        localAuth.alterarSenha(user.id, senhaAtual, novaSenha)
      }
    },
    [user],
  )

  const value = useMemo(
    () => ({ loading, user, perfil, signUp, signIn, signOut, refreshPerfil, toggleFavorito, atualizarNome, salvarChaveGemini, alterarSenha }),
    [loading, user, perfil, signUp, signIn, signOut, refreshPerfil, toggleFavorito, atualizarNome, salvarChaveGemini, alterarSenha],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
