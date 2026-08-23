import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AulaGeradaSchema, TIPOS_BLOCO_IA } from '../src/lib/aiSchema'
import { SYSTEM_PROMPT_GERAR_AULA } from '../src/lib/aiPrompt'

// Texto extraído do PDF vem em base64 do cliente; ~4.4MB é o limite prático
// de corpo de requisição em funções serverless da Vercel — fica com folga.
// Também fica bem abaixo da cota de tokens por minuto do tier gratuito do Gemini.
const MAX_TEXTO_CHARS = 350_000

// Alias que a Google mantém sempre apontando pro Flash mais recente — evita
// fixar uma versão específica (ex.: "gemini-3-flash") que pode ser descontinuada.
// O Flash é o modelo recomendado no tier gratuito (Pro não tem cota grátis).
const MODEL = 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// Chamamos a API REST do Gemini direto com fetch (em vez do pacote
// @google/genai) pra não carregar suas dependências pesadas Node-only
// (google-auth-library, protobufjs, ws) dentro da função serverless da
// Vercel — não precisamos de nada disso pra uma chamada simples com chave de API.

// JSON Schema padrão — o Gemini aceita via `responseJsonSchema` dentro de
// `generationConfig`, que suporta additionalProperties (precisa pro "altExp",
// que tem uma chave por alternativa A-E).
const AULA_JSON_SCHEMA = {
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

interface GeminiPart {
  text?: string
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método não permitido.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({
      ok: false,
      error: 'IA não configurada no servidor (falta GEMINI_API_KEY nas variáveis de ambiente do Vercel).',
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
    const userText = [
      materiaOverride?.trim() ? `Matéria sugerida pelo usuário (use este nome exato): ${materiaOverride.trim()}` : null,
      nomeArquivo ? `Nome do arquivo original: ${nomeArquivo}` : null,
      '--- TEXTO EXTRAÍDO DO PDF ---',
      texto,
    ]
      .filter(Boolean)
      .join('\n\n')

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT_GERAR_AULA }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: AULA_JSON_SCHEMA,
          maxOutputTokens: 24000,
        },
      }),
    })

    const dados = (await geminiRes.json()) as GeminiResponse

    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        res.status(429).json({
          ok: false,
          error: 'Cota gratuita da IA esgotada por agora (limite do tier gratuito do Gemini). Tente novamente em alguns minutos.',
        })
        return
      }
      console.error('gerar-aula: Gemini retornou erro:', geminiRes.status, dados.error)
      res.status(502).json({ ok: false, error: dados.error?.message || 'A IA recusou o pedido. Tente novamente.' })
      return
    }

    if (dados.promptFeedback?.blockReason) {
      res.status(502).json({ ok: false, error: `A IA bloqueou o conteúdo (motivo: ${dados.promptFeedback.blockReason}).` })
      return
    }

    const candidato = dados.candidates?.[0]
    if (candidato?.finishReason === 'MAX_TOKENS') {
      res.status(502).json({
        ok: false,
        error: 'A aula gerada ficou grande demais e foi cortada. Tente dividir o PDF em partes menores.',
      })
      return
    }
    if (candidato?.finishReason && candidato.finishReason !== 'STOP') {
      res.status(502).json({ ok: false, error: `A IA não conseguiu gerar a aula (motivo: ${candidato.finishReason}).` })
      return
    }

    const textoResposta = candidato?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!textoResposta) {
      res.status(502).json({ ok: false, error: 'A IA não devolveu nenhum conteúdo. Tente novamente.' })
      return
    }

    let bruto: unknown
    try {
      bruto = JSON.parse(textoResposta)
    } catch {
      res.status(502).json({ ok: false, error: 'A IA devolveu um JSON inválido. Tente novamente.' })
      return
    }

    const validado = AulaGeradaSchema.safeParse(bruto)
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
