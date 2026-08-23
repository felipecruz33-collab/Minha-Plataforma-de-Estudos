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
