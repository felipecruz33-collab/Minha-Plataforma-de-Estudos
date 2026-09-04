export const TIPOS_BLOCO = [
  'texto',
  'dica',
  'alerta',
  'memorize',
  'exemplo',
  'palavra',
  'naoconfunda',
  'tabela',
] as const

export type TipoBloco = (typeof TIPOS_BLOCO)[number]

/** Tipos que também alimentam abas filtradas na tela da aula (Seção 4). */
export const TIPOS_COM_ABA: TipoBloco[] = ['dica', 'alerta', 'memorize', 'exemplo', 'tabela']

export interface Bloco {
  tipo: TipoBloco
  ordem: number
  html: string
}

export interface Alternativa {
  id: string
  texto: string
}

export interface Questao {
  id: string
  aulaId: string
  materiaId: string
  tema: string
  banca: string
  ano: string
  orgao: string
  enunciado: string
  alternativas: Alternativa[]
  gabarito: string
  explicacao: string
  altExp: Record<string, string>
}

export interface Aula {
  id: string
  materiaId: string
  titulo: string
  blocos: Bloco[]
  questoes: Questao[]
  /**
   * Posição escolhida pelo usuário dentro da matéria. `null` significa "nunca
   * foi organizada" — nesse caso vale a ordem de criação. Manter os dois casos
   * separados evita ter que inventar uma ordem pra tudo que já existe.
   */
  ordem: number | null
  /**
   * Se esta aula é uma CÓPIA da biblioteca compartilhada.
   *
   * Sem Premium, o título continua visível mas o conteúdo não vem — quem
   * decide isso é a RLS do banco (0016), não a tela. Aula criada pela própria
   * pessoa nunca é marcada.
   */
  daBiblioteca: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface Materia {
  id: string
  userId: string | null
  nome: string
  isBiblioteca: boolean
  criadoEm: string
}

export interface Resposta {
  id: string
  userId: string
  questaoId: string
  aulaId: string
  materiaId: string
  alternativaEscolhida: string
  correta: boolean
  respondidoEm: string
}

export interface SimuladoMateria {
  materiaId: string
  materiaNome: string
  quantidade: number
  acertos: number
}

export interface Simulado {
  id: string
  userId: string
  nome: string
  materias: SimuladoMateria[]
  tempoLimiteSegundos: number | null
  duracaoSegundos: number
  totalQuestoes: number
  acertos: number
  criadoEm: string
}

export interface ItemCronograma {
  id: string
  materiaId: string | null
  materiaNome: string
  aulaId: string | null
  descricao: string
  concluido: boolean
  /**
   * Dia dentro da semana: 0 = primeiro dia, 6 = último.
   *
   * Opcional porque cronogramas criados antes da divisão por dia não têm o
   * campo — e continuam válidos: essas tarefas aparecem no grupo "sem dia
   * marcado" em vez de sumirem. Como `semanas` é uma coluna `jsonb`, o campo
   * novo não precisou de migração.
   */
  dia?: number | null
  /**
   * De qual semana a tarefa veio, quando foi remanejada por não ter sido feita.
   *
   * Guarda a origem PRIMEIRA, não a última: uma tarefa arrastada por três
   * semanas continua mostrando o tamanho real do atraso.
   */
  veioDaSemana?: number
}

export interface SemanaCronograma {
  numero: number
  inicioEm: string
  fimEm: string
  itens: ItemCronograma[]
}

export interface Cronograma {
  id: string
  userId: string
  nome: string
  modo: 'automatico' | 'manual'
  dataInicio: string
  dataFim: string
  materias: { materiaId: string; materiaNome: string }[]
  semanas: SemanaCronograma[]
  criadoEm: string
  atualizadoEm: string
}

export interface GeracaoIA {
  id: string
  userId: string
  nomeArquivo: string
  materia: string
  aulaTitulo: string
  status: 'concluido' | 'erro'
  mensagem?: string
  criadoEm: string
}

/**
 * Uma linha do medidor de IA (`uso_ia`): um pedido enviado ao servidor.
 *
 * Um PDF dividido em partes deixa uma linha por parte, todas com o mesmo
 * `arquivo` — somar `caracteres` dá o tamanho do PDF inteiro, e contar
 * `arquivo` distinto dá o número de PDFs.
 */
export interface UsoIA {
  arquivo: string
  caracteres: number
  criadoEm: string
}

export interface Perfil {
  userId: string
  email: string
  nome: string
  isAdmin: boolean
  isPremium: boolean
  favoritos: string[]
  /** Chave própria e opcional da API do Gemini (gratuita) — usada no lugar da chave
   *  compartilhada da plataforma no "PDF com IA", pra não competir por cota com outros usuários. */
  chaveGemini: string | null
  /**
   * Estado do ciclo de revisão. É a única coisa que o ciclo guarda — o resto
   * ele calcula do histórico de respostas.
   */
  revisao: EstadoDoCicloRevisao
}

export interface EstadoDoCicloRevisao {
  /** Quando a pausa começou. `null` = rodando. */
  pausadaEm: string | null
  /** Quando voltou da última pausa. Prazos antigos recontam a partir daqui. */
  retomadaEm: string | null
  /** Marco de recomeço: respostas anteriores a isto ficam fora do ciclo. */
  reinicio: string | null
}

/** Estrutura exata de importação/geração (Seção 6). */
export interface AulaImportPayload {
  materia: string
  aula: {
    titulo: string
    blocos: { tipo: string; ordem: number; html: string }[]
    questoes: {
      tema: string
      banca: string
      ano: string
      orgao: string
      enunciado: string
      alternativas: { id: string; texto: string }[]
      gabarito: string
      explicacao: string
      altExp: Record<string, string>
    }[]
  }
}
