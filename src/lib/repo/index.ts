import { isSupabaseConfigured } from '../supabaseClient'
import { CachedRepository } from './cacheRepo'
import { LocalRepository } from './localRepo'
import { SupabaseRepository } from './supabaseRepo'
import type { DataRepository } from './types'

export * from './types'

export const usingSupabase = isSupabaseConfigured

/**
 * O repositório com cache por cima do de verdade.
 *
 * Fica exposto separadamente porque a troca de conta precisa limpá-lo à mão:
 * o cache é indexado por id de usuário, mas guardar em memória as leituras de
 * quem acabou de sair não serve pra nada e ocupa espaço.
 */
export const cacheDoRepo = new CachedRepository(
  isSupabaseConfigured ? new SupabaseRepository() : new LocalRepository(),
)

export const repo: DataRepository = cacheDoRepo
