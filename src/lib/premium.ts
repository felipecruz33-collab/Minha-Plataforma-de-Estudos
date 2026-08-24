import type { Perfil } from './types'

/**
 * Biblioteca compartilhada é exclusiva de assinantes Premium (Seção 3/7).
 *
 * Ficou aberta pra todo mundo por um tempo, na fase de crescimento antes da
 * Play Store. Este é o único interruptor do lado do app.
 *
 * IMPORTANTE: pra quem usa Supabase, isto sozinho não bloqueia nada de
 * verdade — só esconde a tela. Quem bloqueia é a RLS do banco
 * (`0011_biblioteca_premium.sql`). As duas partes precisam andar juntas: com
 * o interruptor `false` e a migração não aplicada, alguém que chamasse a API
 * direto ainda leria a biblioteca; com o interruptor `true` e a migração
 * aplicada, a tela apareceria e viria vazia.
 */
export const BIBLIOTECA_ABERTA_PARA_TODOS = false

export function podeVerBiblioteca(perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined): boolean {
  return BIBLIOTECA_ABERTA_PARA_TODOS || !!perfil?.isPremium || !!perfil?.isAdmin
}

/**
 * Quantos PDFs uma conta gratuita pode converter com a IA.
 *
 * O limite existe porque cada conversão custa cota de IA de verdade — é o
 * único recurso do app que gasta dinheiro (ou a cota gratuita compartilhada)
 * a cada uso. Importar arquivo .json continua ilimitado pra todo mundo: ali o
 * conteúdo já vem pronto e o app só valida e salva.
 */
export const LIMITE_PDF_GRATIS = 3

export function temPremium(perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined): boolean {
  return !!perfil?.isPremium || !!perfil?.isAdmin
}

/** Quantos PDFs ainda cabem na conta. `null` = sem limite (Premium/admin). */
export function pdfsRestantes(
  perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined,
  pdfsUsados: number,
): number | null {
  if (temPremium(perfil)) return null
  return Math.max(0, LIMITE_PDF_GRATIS - pdfsUsados)
}
