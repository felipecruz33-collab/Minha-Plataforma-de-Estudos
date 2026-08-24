import type { Perfil } from './types'

/**
 * Biblioteca aberta pra todo mundo por enquanto (fase de crescimento antes
 * da Play Store) — a intenção original (Seção 3/7) é ser exclusiva Premium,
 * e esse é o único interruptor que precisa mudar quando isso for reativado.
 *
 * IMPORTANTE: pra quem usa Supabase, isso sozinho NÃO bloqueia nada de
 * verdade — o banco também libera a leitura da biblioteca pra qualquer
 * usuário autenticado (migração 0009_biblioteca_aberta.sql). Reativar o
 * bloqueio exige as duas partes: virar isto pra `false` E reverter aquela
 * migração (recriar as policies de leitura da biblioteca usando
 * `is_premium_or_admin(auth.uid())` em vez de `auth.uid() is not null` —
 * o SQL de referência está comentado dentro da própria migração).
 */
export const BIBLIOTECA_ABERTA_PARA_TODOS = true

export function podeVerBiblioteca(perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined): boolean {
  return BIBLIOTECA_ABERTA_PARA_TODOS || !!perfil?.isPremium || !!perfil?.isAdmin
}
