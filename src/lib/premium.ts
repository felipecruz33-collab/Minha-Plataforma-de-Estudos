import type { Perfil, UsoIA } from './types'

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
 * Teto mensal de páginas convertidas com IA no Premium.
 *
 * O Premium nunca teve limite de QUANTIDADE — só de tamanho por arquivo. Isso
 * funcionava enquanto a IA vinha de cotas gratuitas: o pior caso era um erro
 * de "tente mais tarde". Com uma chave paga, o pior caso passa a ser uma
 * conta a pagar, e ela não cresce com o tempo, cresce com o uso: um único
 * assinante animado pode chegar lá no primeiro fim de semana.
 *
 * Contas da casa, medidas no código: um PDF de 200 páginas vira 20 chamadas,
 * ~81 mil tokens de entrada e até 240 mil de saída. Quarenta importações
 * dessas num sábado são 800 chamadas de uma pessoa só.
 *
 * 2.000 páginas por mês são dez apostilas inteiras de 200 páginas — muito
 * acima do que alguém estudando de verdade consome, e ainda assim um número
 * que existe. Quem passar disso não é um estudante: é um problema.
 */
export const LIMITE_PAGINAS_PREMIUM_MES = 2000

/** Em quantos dias a cota mensal do Premium se renova. */
export const JANELA_PREMIUM_DIAS = 30

/**
 * Folga acima do teto, só pra um arquivo JÁ COMEÇADO poder terminar.
 *
 * Um PDF grande vira até 20 pedidos separados. Sem esta folga, quem
 * atravessasse o teto no meio de um deles ficaria com a aula pela metade —
 * cobrado pelo que gastou e sem o resultado. Vale só pra arquivos que já
 * deixaram rastro na janela; um arquivo novo é recusado no teto, sem folga.
 */
export const FOLGA_PAGINAS_PREMIUM = 500

/** Início da janela mensal do Premium — tudo antes disso não conta mais. */
export function inicioDaJanelaPremium(agora = new Date()): string {
  return new Date(agora.getTime() - JANELA_PREMIUM_DIAS * DIA_MS).toISOString()
}

/**
 * Converte caracteres em páginas usando a mesma régua do limite de tamanho.
 *
 * O medidor guarda caracteres porque é o que o servidor realmente recebe;
 * página é a unidade que a pessoa entende. A conversão precisa ser a mesma
 * dos dois lados, senão a tela promete um número e o servidor aplica outro.
 */
export function paginasDeCaracteres(caracteres: number): number {
  return Math.ceil(Math.max(0, caracteres) / CHARS_POR_PAGINA)
}

export interface SituacaoPremium {
  /** Páginas já convertidas dentro da janela. */
  usadas: number
  /** Quantas ainda cabem — 0 quando o teto foi atingido. */
  restantes: number
  limite: number
  noTeto: boolean
  /** Quando a cota volta a abrir. Só faz sentido quando `noTeto`. */
  renovaEm: Date | null
}

/**
 * Situação da cota mensal a partir das linhas do medidor.
 *
 * Devolve `null` pra quem não é Premium: essa conta é limitada por ARQUIVOS
 * (ver `situacaoPdf`), e mostrar as duas coisas ao mesmo tempo só confundiria.
 *
 * A janela é deslizante como a do plano gratuito, pelo mesmo motivo: quem usou
 * pouco em março não deve esperar a virada do mês junto com quem usou tudo.
 */
export function situacaoPremium(
  perfil: Pick<Perfil, 'isPremium' | 'isAdmin'> | null | undefined,
  usos: Pick<UsoIA, 'caracteres' | 'criadoEm'>[],
  agora = new Date(),
): SituacaoPremium | null {
  if (!temPremium(perfil)) return null

  const caracteres = usos.reduce((soma, u) => soma + (u.caracteres || 0), 0)
  const usadas = paginasDeCaracteres(caracteres)
  const restantes = Math.max(0, LIMITE_PAGINAS_PREMIUM_MES - usadas)
  const base = { usadas, restantes, limite: LIMITE_PAGINAS_PREMIUM_MES }
  if (restantes > 0 || usos.length === 0) return { ...base, noTeto: false, renovaEm: null }

  // A cota volta a abrir quando o uso MAIS ANTIGO da janela sair dela.
  const maisAntigo = usos.reduce((a, b) => (a.criadoEm < b.criadoEm ? a : b)).criadoEm
  const renovaEm = new Date(new Date(maisAntigo).getTime() + JANELA_PREMIUM_DIAS * DIA_MS)
  return { ...base, noTeto: true, renovaEm: renovaEm > agora ? renovaEm : null }
}

/**
 * A regra que o SERVIDOR aplica. A tela avisa antes; quem recusa é esta.
 *
 * `arquivoJaNaJanela` distingue "começou um PDF novo depois de estourar o
 * teto" (recusa) de "está terminando um PDF que começou antes" (passa, até a
 * folga acabar).
 */
export function premiumBloqueado(paginasUsadas: number, arquivoJaNaJanela: boolean): boolean {
  if (paginasUsadas < LIMITE_PAGINAS_PREMIUM_MES) return false
  if (!arquivoJaNaJanela) return true
  return paginasUsadas >= LIMITE_PAGINAS_PREMIUM_MES + FOLGA_PAGINAS_PREMIUM
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
