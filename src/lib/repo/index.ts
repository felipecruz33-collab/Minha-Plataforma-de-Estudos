import { isSupabaseConfigured } from '../supabaseClient'
import { LocalRepository } from './localRepo'
import { SupabaseRepository } from './supabaseRepo'
import type { DataRepository } from './types'

export * from './types'

export const usingSupabase = isSupabaseConfigured

export const repo: DataRepository = isSupabaseConfigured ? new SupabaseRepository() : new LocalRepository()
