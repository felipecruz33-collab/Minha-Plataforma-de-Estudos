import { z } from 'zod'

/**
 * Schema intermediário — o que a IA realmente devolve em `api/gerar-aula.ts`.
 * Puramente semântico: sem HTML, sem classes CSS, sem "ordem" (a ordem vira
 * a posição no array `blocos`). `src/lib/lessonCompiler.ts` transforma isso
 * no formato final (`AulaImportPayload`, o mesmo que o importador de .json
 * manual já usa) — a IA nunca produz HTML diretamente.
 *
 * Sem imports Vite-specific — roda tanto no navegador quanto no runtime
 * Node da função serverless.
 */

export const TIPOS_BLOCO_IA = [
  'texto',
  'dica',
  'alerta',
  'memorize',
  'exemplo',
  'palavra',
  'naoconfunda',
  'tabela',
] as const

const SubtopicoSchema = z.object({
  titulo: z.string().min(1),
  conteudo: z.string().min(1),
})

const BlocoIntermediateSchema = z
  .object({
    tipo: z.enum(TIPOS_BLOCO_IA),
    titulo: z.string().optional(),
    conteudo: z.string().optional(),
    subtopicos: z.array(SubtopicoSchema).optional(),
    itens: z.array(z.string().min(1)).optional(),
    colunas: z.array(z.string().min(1)).optional(),
    linhas: z.array(z.array(z.string())).optional(),
  })
  .refine(
    (b) => {
      const temTabela = !!(b.colunas?.length && b.linhas?.length)
      if (b.tipo === 'tabela') return temTabela
      if (b.tipo === 'texto') return !!(b.titulo?.trim() || b.conteudo?.trim() || b.subtopicos?.length)
      if (b.tipo === 'naoconfunda') return !!(b.conteudo?.trim() || b.itens?.length || temTabela)
      return !!(b.conteudo?.trim() || b.itens?.length)
    },
    { message: 'bloco sem conteúdo suficiente para o tipo informado' },
  )

const AlternativaSchema = z.object({
  id: z.string().regex(/^[A-E]$/, 'precisa ser uma letra entre A e E'),
  texto: z.string().min(1),
})

const QuestaoIntermediateSchema = z.object({
  tema: z.string(),
  banca: z.string(),
  ano: z.string(),
  orgao: z.string(),
  enunciado: z.string().min(1),
  alternativas: z.array(AlternativaSchema).min(2).max(5),
  gabarito: z.string().regex(/^[A-E]$/),
  explicacao: z.string(),
  altExp: z.record(z.string(), z.string()),
})

const AulaIntermediateSchema = z
  .object({
    titulo: z.string().min(1),
    blocos: z.array(BlocoIntermediateSchema),
    questoes: z.array(QuestaoIntermediateSchema),
  })
  // Antes exigia pelo menos um bloco. Isso recusava um PDF que é só banco de
  // questões — sem teoria pra extrair, mas cheio de conteúdo útil. O que a
  // aula não pode é vir completamente vazia.
  .refine((a) => a.blocos.length > 0 || a.questoes.length > 0, {
    message: 'aula sem nenhum bloco e sem nenhuma questão',
  })

export const AulaGeradaIntermediateSchema = z.object({
  materia: z.string().min(1),
  aulas: z.array(AulaIntermediateSchema).min(1, 'a IA não devolveu nenhuma aula aproveitável'),
})

export type AulaGeradaIntermediate = z.infer<typeof AulaGeradaIntermediateSchema>
export type AulaIntermediate = z.infer<typeof AulaIntermediateSchema>
export type BlocoIntermediate = z.infer<typeof BlocoIntermediateSchema>
export type QuestaoIntermediate = z.infer<typeof QuestaoIntermediateSchema>
