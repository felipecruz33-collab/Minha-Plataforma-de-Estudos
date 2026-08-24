import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AulaGeradaIntermediateSchema, TIPOS_BLOCO_IA } from '../src/lib/aiIntermediateSchema.js'
import { SYSTEM_PROMPT_GERAR_AULA } from '../src/lib/aiPrompt.js'
import { AulaGeradaSchema } from '../src/lib/aiSchema.js'
import { compilarAulas } from '../src/lib/lessonCompiler.js'

// Texto extraído do PDF vem em base64 do cliente; ~4.4MB é o limite prático
// de corpo de requisição em funções serverless da Vercel — fica com folga.
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

// JSON Schema do formato INTERMEDIÁRIO (semântico — sem HTML, sem "ordem").
// A IA nunca gera o HTML final; `src/lib/lessonCompiler.ts` faz isso depois,
// a partir de templates fixos — por isso a saída da IA é segura por
// construção, e não só por ser filtrada depois.
const SUBTOPICO_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string', minLength: 1 },
    conteudo: { type: 'string', minLength: 1 },
  },
  required: ['titulo', 'conteudo'],
}

const BLOCO_SCHEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: [...TIPOS_BLOCO_IA] },
    titulo: { type: 'string' },
    conteudo: { type: 'string' },
    subtopicos: { type: 'array', items: SUBTOPICO_SCHEMA },
    itens: { type: 'array', items: { type: 'string' } },
    colunas: { type: 'array', items: { type: 'string' } },
    linhas: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
  },
  required: ['tipo'],
}

const QUESTAO_SCHEMA = {
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
}

const AULA_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string', minLength: 1 },
    blocos: { type: 'array', minItems: 1, items: BLOCO_SCHEMA },
    questoes: { type: 'array', items: QUESTAO_SCHEMA },
  },
  required: ['titulo', 'blocos', 'questoes'],
}

const AULA_GERADA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    materia: { type: 'string', minLength: 1 },
    aulas: { type: 'array', minItems: 1, items: AULA_SCHEMA },
  },
  required: ['materia', 'aulas'],
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

async function chamarGemini(apiKey: string, promptTexto: string): Promise<{ res: Response; dados: GeminiResponse }> {
  const corpoRequisicao = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT_GERAR_AULA }] },
    contents: [{ role: 'user', parts: [{ text: promptTexto }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: AULA_GERADA_JSON_SCHEMA,
      maxOutputTokens: 24000,
    },
  })

  // O modelo Flash gratuito às vezes devolve 503 "high demand" em pico de
  // uso — geralmente passa em poucos segundos, então tenta de novo antes
  // de desistir. Backoff curto de propósito: com o reparo (uma segunda
  // chamada possível), o tempo total ainda precisa caber nos 60s da função.
  const esperasEntreTentativas = [0, 3000]
  let res: Response
  let dados: GeminiResponse
  do {
    const espera = esperasEntreTentativas.shift()!
    if (espera) await new Promise((r) => setTimeout(r, espera))
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: corpoRequisicao,
    })
    dados = (await res.json()) as GeminiResponse
  } while (res.status === 503 && esperasEntreTentativas.length > 0)

  return { res, dados }
}

// Tenta cada chave da lista em ordem, passando pra próxima só quando a
// anterior devolveu 503 (alta demanda) mesmo após suas próprias tentativas
// internas — outros erros (429, 400 etc.) não acionam a próxima chave, pois
// não é isso que resolveria o problema. Devolve também qual chave funcionou,
// pra reusá-la no eventual reparo em vez de recomeçar a fila do zero.
async function chamarGeminiComReserva(
  chaves: string[],
  promptTexto: string,
): Promise<{ res: Response; dados: GeminiResponse; chaveUsada: string }> {
  let ultimaTentativa: { res: Response; dados: GeminiResponse } | undefined
  for (const chave of chaves) {
    const tentativa = await chamarGemini(chave, promptTexto)
    if (tentativa.res.status !== 503) {
      return { ...tentativa, chaveUsada: chave }
    }
    ultimaTentativa = tentativa
  }
  return { ...ultimaTentativa!, chaveUsada: chaves[chaves.length - 1] }
}

function extrairTexto(dados: GeminiResponse): string {
  const candidato = dados.candidates?.[0]
  return candidato?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método não permitido.' })
    return
  }

  const { texto, materiaOverride, nomeArquivo, chaveUsuario } = (req.body ?? {}) as {
    texto?: string
    materiaOverride?: string
    nomeArquivo?: string
    chaveUsuario?: string
  }

  // Prioriza a chave própria do usuário (evita fila compartilhada), depois a
  // chave principal da plataforma e por fim uma chave reserva opcional — se
  // uma chave devolver 503 (alta demanda), a próxima da lista é tentada
  // automaticamente antes de desistir. GEMINI_API_KEY_RESERVA é opcional:
  // sem ela, o comportamento é o mesmo de antes (só a chave principal).
  const chaves = Array.from(
    new Set(
      [chaveUsuario?.trim(), process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_RESERVA]
        .map((k) => k?.trim())
        .filter((k): k is string => !!k),
    ),
  )
  if (chaves.length === 0) {
    res.status(500).json({
      ok: false,
      error:
        'IA não configurada. Adicione sua própria chave gratuita do Gemini em "Perfil", ou peça pro administrador configurar GEMINI_API_KEY no servidor.',
    })
    return
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

    const { res: geminiRes, dados, chaveUsada } = await chamarGeminiComReserva(chaves, userText)

    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        res.status(429).json({
          ok: false,
          error: chaveUsuario
            ? 'Cota gratuita da sua chave do Gemini esgotada por agora. Tente novamente em alguns minutos.'
            : 'Cota gratuita compartilhada esgotada por agora. Adicione sua própria chave grátis em "Perfil" pra não depender dela, ou tente de novo mais tarde.',
        })
        return
      }
      if (geminiRes.status === 503) {
        res.status(503).json({
          ok: false,
          error:
            chaves.length > 1
              ? 'O modelo de IA está com alta demanda no Google agora (já tentei de novo automaticamente e testei mais de uma chave). Espera um pouco e tenta de novo.'
              : chaveUsuario
                ? 'O modelo de IA está com alta demanda no Google agora (já tentei de novo automaticamente). Espera um pouco e tenta de novo.'
                : 'O modelo de IA está com alta demanda no Google agora, mesmo já tentando de novo automaticamente. Adicionar sua própria chave grátis em "Perfil" costuma resolver, já que ela não compete com a de outros usuários.',
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
    if (dados.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      res.status(502).json({
        ok: false,
        error: 'A aula gerada ficou grande demais e foi cortada. Tente dividir o PDF em partes menores.',
      })
      return
    }

    let textoResposta = extrairTexto(dados)
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

    let validado = AulaGeradaIntermediateSchema.safeParse(bruto)

    // Se a estrutura veio errada, dá uma chance de reparo: manda de volta o
    // que a IA gerou + os erros específicos do schema, pedindo pra corrigir
    // só a estrutura (sem mexer no conteúdo pedagógico nem inventar nada).
    if (!validado.success) {
      const erros = validado.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      console.error('gerar-aula: saída intermediária inválida, tentando reparo:', erros)

      const promptReparo = [
        userText,
        '--- TENTATIVA ANTERIOR (INVÁLIDA) ---',
        textoResposta,
        '--- ERROS DE ESTRUTURA ENCONTRADOS ---',
        erros.join('\n'),
        'Corrija SOMENTE esses problemas estruturais no JSON acima. Não altere o conteúdo pedagógico, não remova nem invente questões, não invente informação que não estava lá. Devolva o JSON corrigido completo, com a mesma estrutura geral.',
      ].join('\n\n')

      const reparo = await chamarGemini(chaveUsada, promptReparo)
      if (!reparo.res.ok) {
        res.status(502).json({ ok: false, error: 'A IA devolveu um formato inválido e a correção automática falhou. Tente novamente.' })
        return
      }
      textoResposta = extrairTexto(reparo.dados)
      try {
        bruto = JSON.parse(textoResposta)
      } catch {
        res.status(502).json({ ok: false, error: 'A IA devolveu um JSON inválido mesmo após a correção. Tente novamente.' })
        return
      }
      validado = AulaGeradaIntermediateSchema.safeParse(bruto)
      if (!validado.success) {
        console.error('gerar-aula: saída ainda inválida após reparo:', validado.error.flatten())
        res.status(502).json({ ok: false, error: 'A IA devolveu dados em formato inesperado, mesmo após tentar corrigir. Tente novamente.' })
        return
      }
    }

    // Compila o JSON semântico da IA no formato final (o mesmo que o
    // importador de .json manual usa) e revalida contra o schema final —
    // segunda camada de validação, agora sobre o HTML já gerado por nós.
    const aulasCompiladas = compilarAulas(validado.data)
    const aulasValidadas = aulasCompiladas.map((aula) => AulaGeradaSchema.safeParse(aula))
    const falhas = aulasValidadas.filter((v) => !v.success)
    if (falhas.length > 0) {
      console.error(
        'gerar-aula: aula compilada não bateu com o schema final:',
        falhas.map((f) => (!f.success ? f.error.flatten() : null)),
      )
      res.status(502).json({ ok: false, error: 'Erro interno ao montar a aula. Tente novamente.' })
      return
    }

    res.status(200).json({ ok: true, payload: aulasValidadas.map((v) => (v.success ? v.data : null)) })
  } catch (err) {
    console.error('gerar-aula falhou:', err)
    const mensagem = err instanceof Error ? err.message : 'Erro inesperado ao gerar a aula.'
    res.status(502).json({ ok: false, error: mensagem })
  }
}
