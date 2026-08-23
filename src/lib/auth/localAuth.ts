// Autenticação local (dev/demo) usada quando não há Supabase configurado.
// Guarda usuários no localStorage só para permitir testar o app sem backend —
// nunca use isto em produção.

interface LocalUser {
  id: string
  email: string
  password: string
}

const USERS_KEY = 'mpe:auth:users'
const SESSION_KEY = 'mpe:auth:session'

function loadUsers(): LocalUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveUsers(users: LocalUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function getSession(): { id: string; email: string } | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function signUp(email: string, password: string): { id: string; email: string } {
  const users = loadUsers()
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Já existe uma conta com este e-mail.')
  }
  const user: LocalUser = { id: crypto.randomUUID(), email, password }
  users.push(user)
  saveUsers(users)
  const session = { id: user.id, email: user.email }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function signIn(email: string, password: string): { id: string; email: string } {
  const users = loadUsers()
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
  if (!user || user.password !== password) {
    throw new Error('E-mail ou senha inválidos.')
  }
  const session = { id: user.id, email: user.email }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
}
