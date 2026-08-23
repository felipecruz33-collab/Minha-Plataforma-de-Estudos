import { z } from 'zod'

/**
 * Schema Zod do contrato técnico (Seção 6) — usado para restringir a saída
 * estruturada da API da Claude em `api/gerar-aula.ts`. Importado tanto pelo
 * servidor (função serverless) quanto, indiretamente, pelo cliente (que
 * ainda revalida tudo com `validateAulaImport`, incluindo as regras que um
 * JSON Schema não expressa, como tags de HTML permitidas e gabarito
 * batendo com uma alternativa).
 *
 * Este arquivo não pode importar nada específico do Vite (import.meta.env,
 * imports com `?url` etc.) — precisa rodar tanto no navegador quanto no
 * runtime Node da função serverless.
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

const AlternativaSchema = z.object({
  id: z.string().regex(/^[A-E]$/, 'precisa ser uma letra entre A e E'),
  texto: z.string().min(1),
})

const QuestaoSchema = z.object({
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

const BlocoSchema = z.object({
  tipo: z.enum(TIPOS_BLOCO_IA),
  ordem: z.number().int().nonnegative(),
  html: z.string().min(1),
})

export const AulaGeradaSchema = z.object({
  materia: z.string().min(1),
  aula: z.object({
    titulo: z.string().min(1),
    blocos: z.array(BlocoSchema).min(1),
    questoes: z.array(QuestaoSchema),
  }),
})

export type AulaGerada = z.infer<typeof AulaGeradaSchema>
