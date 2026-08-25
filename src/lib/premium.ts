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
 * Quantos PDFs uma conta gratuita pode converter com a IA a cada período.
 *
 * O limite existe porque cada conversão custa cota de IA de verdade — é o
 * único recurso do app que gasta dinheiro (ou a cota gratuita compartilhada)
 * a cada uso. Importar arquivo .json continua ilimitado pra todo mundo: ali o
 * conteúdo já vem pronto e o app só valida e salva.
 */
export const LIMITE_PDF_GRATIS = 3

/** Em quantos dias a cota se renova. */
export const JANELA_PDF_DIAS = 7

const DIA_MS = 24 * 60 * 60 * 1000

/** Início da janela que vale agora — tudo antes disso não conta mais. */
export function inicioDaJanelaPdf(agora = new Date()): string {
  return new Date(agora.getTime() - JANELA_PDF_DIAS * DIA_MS).toISOString()
}

/**
 * Tamanho máximo do PDF, em páginas, por plano.
 *
 * Existe pra impedir a volta pelo lado: com limite de 3 ARQUIVOS por semana,
 * nada impediria alguém de juntar tudo num PDF de 800 páginas e gastar em um
 * só o que o limite queria espalhar — e cada arquivo desses vira dezenas de
 * chamadas de IA, que é justamente o recurso caro.
 *
 * 50 páginas cobrem com folga uma aula típica de curso; 200 cobrem uma
 * apostila inteira.
 */
export const LIMITE_PAGINAS_GRATIS = 50
export const LIMITE_PAGINAS_PREMIUM = 200

/**
 * Quantos caracteres o servidor aceita por página.
 *
 * O servidor recebe TEXTO, não o PDF — ele não tem como contar páginas, e
 * confiar no número que o navegador manda seria confiar em quem está sendo
 * limitado. Então a checagem do servidor é por tamanho de texto, convertida a
 * partir do limite de páginas.
 *
 * Medindo o PDF real de 73 páginas do teste: 1.628 caracteres por página.
 * 2.200 dá uma folga confortável pra PDFs mais densos que a média, sem abrir
 * a porta pro abuso que o limite quer evitar.
 */
export const CHARS_POR_PAGINA = 2200

export function limitePaginas(perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined): number {
  return temPremium(perfil) ? LIMITE_PAGINAS_PREMIUM : LIMITE_PAGINAS_GRATIS
}

export function temPremium(perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined): boolean {
  return !!perfil?.isPremium || !!perfil?.isAdmin
}

/**
 * Situação da cota de PDF a partir das datas de uso dentro da janela.
 *
 * A janela é DESLIZANTE, não um calendário fixo: cada PDF libera a própria
 * vaga 7 dias depois de ter sido usado. É mais justo do que zerar tudo numa
 * data comum — quem usou 1 PDF na segunda não precisa esperar o mesmo tanto
 * que quem usou 3 no sábado — e não cria a corrida de "vira a semana, todo
 * mundo importa ao mesmo tempo".
 *
 * `restantes: null` significa sem limite (Premium ou admin).
 */
export function situacaoPdf(
  perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined,
  datasDeUso: string[],
  agora = new Date(),
): { restantes: number | null; renovaEm: Date | null } {
  if (temPremium(perfil)) return { restantes: null, renovaEm: null }

  const usados = datasDeUso.length
  const restantes = Math.max(0, LIMITE_PDF_GRATIS - usados)
  if (restantes > 0 || usados === 0) return { restantes, renovaEm: null }

  // A próxima vaga abre quando o uso MAIS ANTIGO da janela completar 7 dias.
  const maisAntigo = datasDeUso.reduce((a, b) => (a < b ? a : b))
  const renovaEm = new Date(new Date(maisAntigo).getTime() + JANELA_PDF_DIAS * DIA_MS)
  return { restantes, renovaEm: renovaEm > agora ? renovaEm : null }
}
