import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import { AulaGeradaSchema, TIPOS_BLOCO_IA } from '../src/lib/aiSchema'
import { SYSTEM_PROMPT_GERAR_AULA } from '../src/lib/aiPrompt'

// Texto extraído do PDF vem em base64 do cliente; ~4.4MB é o limite prático
// de corpo de requisição em funções serverless da Vercel — fica com folga.
const MAX_TEXTO_CHARS = 350_000

// A versão instalada do SDK (0.68.0) não tem `messages.parse`/`output_config`
// (structured outputs), então a saída estruturada é obtida forçando uma
// chamada de tool com JSON Schema — padrão suportado desde sempre na API.
const AULA_TOOL_NAME = 'gerar_aula'
const AULA_INPUT_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    materia: { type: 'string', minLength: 1 },
    aula: {
      type: 'object',
      properties: {
        titulo: { type: 'string', minLength: 1 },
        blocos: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: [...TIPOS_BLOCO_IA] },
              ordem: { type: 'integer', minimum: 0 },
              html: { type: 'string', minLength: 1 },
            },
            required: ['tipo', 'ordem', 'html'],
          },
        },
        questoes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tema: { type: 'string' },
              banca: { type: 'string' },
              ano: { type: 'string' },
              orgao: { type: 'string' },
              enunciado: { type: 'string', minLength: 1 },
              alternativas: {
                type: 'array',
                minItems: 2,
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', pattern: '^[A-E]$' },
                    texto: { type: 'string', minLength: 1 },
                  },
                  required: ['id', 'texto'],
                },
              },
              gabarito: { type: 'string', pattern: '^[A-E]$' },
              explicacao: { type: 'string' },
              altExp: { type: 'object', additionalProperties: { type: 'string' } },
            },
            required: ['tema', 'banca', 'ano', 'orgao', 'enunciado', 'alternativas', 'gabarito', 'explicacao', 'altExp'],
          },
        },
      },
      required: ['titulo', 'blocos', 'questoes'],
    },
  },
  required: ['materia', 'aula'],
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método não permitido.' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({
      ok: false,
      error: 'IA não configurada no servidor (falta ANTHROPIC_API_KEY nas variáveis de ambiente do Vercel).',
    })
    return
  }

  const { texto, materiaOverride, nomeArquivo } = (req.body ?? {}) as {
    texto?: string
    materiaOverride?: string
    nomeArquivo?: string
  }

  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    res.status(400).json({ ok: false, error: 'Texto do PDF vazio ou ausente.' })
    return
  }
  if (texto.length > MAX_TEXTO_CHARS) {
    res.status(400).json({
      ok: false,
      error: `PDF muito extenso para processar de uma vez (${Math.round(texto.length / 1000)} mil caracteres). Tente dividir o PDF em partes menores.`,
    })
    return
  }

  try {
    const client = new Anthropic({ apiKey })

    const userText = [
      materiaOverride?.trim() ? `Matéria sugerida pelo usuário (use este nome exato): ${materiaOverride.trim()}` : null,
      nomeArquivo ? `Nome do arquivo original: ${nomeArquivo}` : null,
      '--- TEXTO EXTRAÍDO DO PDF ---',
      texto,
    ]
      .filter(Boolean)
      .join('\n\n')

    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 24000,
      system: SYSTEM_PROMPT_GERAR_AULA,
      messages: [{ role: 'user', content: userText }],
      tools: [
        {
          name: AULA_TOOL_NAME,
          description: 'Registra a aula estruturada (teoria + questões) gerada a partir do texto do PDF.',
          input_schema: AULA_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: AULA_TOOL_NAME },
    })

    if (response.stop_reason === 'max_tokens') {
      res.status(502).json({
        ok: false,
        error: 'A aula gerada ficou grande demais e foi cortada. Tente dividir o PDF em partes menores.',
      })
      return
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === AULA_TOOL_NAME,
    )
    if (!toolUse) {
      res.status(502).json({ ok: false, error: 'A IA não devolveu um formato válido. Tente novamente.' })
      return
    }

    const validado = AulaGeradaSchema.safeParse(toolUse.input)
    if (!validado.success) {
      console.error('gerar-aula: saída da IA não bateu com o schema:', validado.error.flatten())
      res.status(502).json({ ok: false, error: 'A IA devolveu dados em formato inesperado. Tente novamente.' })
      return
    }

    res.status(200).json({ ok: true, payload: validado.data })
  } catch (err) {
    console.error('gerar-aula falhou:', err)
    const mensagem = err instanceof Error ? err.message : 'Erro inesperado ao gerar a aula.'
    res.status(502).json({ ok: false, error: mensagem })
  }
}
