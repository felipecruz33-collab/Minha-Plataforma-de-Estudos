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

// Groq e OpenRouter: outros provedores gratuitos, não-Google, usados só
// como reserva quando TODAS as chaves do Gemini estiverem sem cota ou
// sobrecarregadas — resolve o caso relatado de "o Gemini grátis está sempre
// sobrecarregado/sem cota". Os dois falam o mesmo formato compatível com
// OpenAI, então usam a mesma função de chamada (chamarOpenAiCompat) — só
// mudam URL, modelo e o nome do campo de limite de tokens de saída.
//
// openai/gpt-oss-120b é o modelo de produção atual recomendado pela própria
// Groq como substituto dos modelos Llama 3.x que ela vem descontinuando —
// mesmo motivo de usar um alias no Gemini acima: não fixar um nome que já
// saiu de linha.
//
// openrouter/free é o "Free Models Router" oficial da OpenRouter (lançado
// fev/2026): sorteia automaticamente entre os modelos gratuitos disponíveis
// no momento, já filtrando por quem suporta o que o pedido precisa
// (aqui, saída estruturada) — evita fixar um modelo `:free` específico, que
// entra e sai de linha com frequência.
interface ProvedorOpenAiCompat {
  id: 'groq' | 'openrouter'
  url: string
  model: string
  campoMaxTokens: 'max_completion_tokens' | 'max_tokens'
}

const GROQ: ProvedorOpenAiCompat = {
  id: 'groq',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'openai/gpt-oss-120b',
  campoMaxTokens: 'max_completion_tokens',
}

// A OpenRouter documenta seu próprio parâmetro normalizado como "max_tokens"
// (ela é um proxy pra vários backends diferentes) — diferente da Groq, que é
// diretamente compatível com a API da OpenAI e usa "max_completion_tokens".
const OPENROUTER: ProvedorOpenAiCompat = {
  id: 'openrouter',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'openrouter/free',
  campoMaxTokens: 'max_tokens',
}

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

// Nem Groq nem OpenRouter aceitam um JSON Schema pra forçar o formato como o
// Gemini aceita (responseJsonSchema) no modo "json_object" — só garantem
// sintaxe JSON válida, sem garantir a estrutura. Por isso reforçamos a
// estrutura esperada no próprio prompt, reusando o mesmo schema já definido
// acima (fonte única) — e a validação/reparo já existentes cobrem o resto.
// O modo "json_object" também exige que a palavra "JSON" apareça nas
// mensagens, senão o pedido é recusado.
const SUFIXO_JSON_MODO_OBJETO = `\n\nResponda em JSON. Devolva SOMENTE um objeto JSON válido (sem markdown, sem texto fora do JSON), seguindo exatamente este formato:\n${JSON.stringify(AULA_GERADA_JSON_SCHEMA)}`

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

// Formato compatível com OpenAI, compartilhado pela Groq e pela OpenRouter.
interface OpenAiCompatResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  error?: { message?: string }
}

type Tentativa =
  | { res: Response; provedor: 'gemini'; dados: GeminiResponse }
  | { res: Response; provedor: 'groq'; dados: OpenAiCompatResponse }
  | { res: Response; provedor: 'openrouter'; dados: OpenAiCompatResponse }

// A função tem no máximo 60s na Vercel (vercel.json) antes de ser encerrada
// pela própria plataforma — e quando isso acontece, quem chega no navegador
// é uma página de erro HTML da Vercel, não a nossa resposta JSON (é
// exatamente o "resposta não veio em JSON" que aparece pro usuário).
// Trabalhamos com uma margem menor pra sempre sobrar tempo de montar e
// devolver a nossa própria resposta.
const LIMITE_MS = 50_000

// Reserva final garantida pra compilar/validar/serializar a resposta depois
// que a IA responde — nenhuma chamada externa pode consumir esse naco.
const RESERVA_RESPOSTA_MS = 4_000

/** Status sintético (não vem de nenhum provedor) pra "estourou o nosso próprio teto de tempo". */
const STATUS_TEMPO_ESGOTADO = 599

function msRestantes(inicio: number): number {
  return LIMITE_MS - RESERVA_RESPOSTA_MS - (Date.now() - inicio)
}

/**
 * `fetch` com teto de tempo próprio, calculado pelo que ainda sobra do
 * orçamento da função. Sem isso, uma única chamada travada num provedor
 * passa direto pelo controle de tempo (que só valia ENTRE provedores),
 * estoura os 60s e faz a Vercel matar a função no meio — devolvendo HTML em
 * vez do nosso JSON. Com o teto, sempre desistimos antes e respondemos nós.
 */
async function fetchComTeto(url: string, opcoes: RequestInit, inicio: number): Promise<Response> {
  const restante = msRestantes(inicio)
  if (restante <= 0) throw new Error('Sem orçamento de tempo restante para chamar a IA.')

  const controlador = new AbortController()
  const timer = setTimeout(() => controlador.abort(), restante)
  try {
    return await fetch(url, { ...opcoes, signal: controlador.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Resposta sintética usada quando a chamada foi abortada/falhou na rede — faz a cascata seguir pro próximo provedor. */
function tentativaTempoEsgotado(provedor: ProvedorConfig['provedor']): Tentativa {
  const res = new Response(null, { status: STATUS_TEMPO_ESGOTADO })
  return provedor === 'gemini'
    ? { res, provedor: 'gemini', dados: {} }
    : { res, provedor: provedor as 'groq' | 'openrouter', dados: {} }
}

async function chamarGemini(apiKey: string, promptTexto: string, inicio: number): Promise<Tentativa> {
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
  try {
    do {
      const espera = esperasEntreTentativas.shift()!
      // Só espera pra tentar de novo se ainda sobrar tempo pra isso valer a pena.
      if (espera) {
        if (msRestantes(inicio) <= espera) return tentativaTempoEsgotado('gemini')
        await new Promise((r) => setTimeout(r, espera))
      }
      res = await fetchComTeto(
        GEMINI_URL,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: corpoRequisicao },
        inicio,
      )
      dados = (await res.json()) as GeminiResponse
    } while (res.status === 503 && esperasEntreTentativas.length > 0)
  } catch (err) {
    // Abortado pelo nosso teto de tempo, ou falha de rede — nos dois casos
    // vale tentar o próximo provedor da fila em vez de derrubar o pedido.
    console.error('gerar-aula: chamada ao Gemini abortada/falhou:', err instanceof Error ? err.message : err)
    return tentativaTempoEsgotado('gemini')
  }

  return { res, dados, provedor: 'gemini' }
}

async function chamarOpenAiCompat(cfg: ProvedorOpenAiCompat, apiKey: string, promptTexto: string, inicio: number): Promise<Tentativa> {
  const corpoRequisicao = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_GERAR_AULA + SUFIXO_JSON_MODO_OBJETO },
      { role: 'user', content: promptTexto },
    ],
    response_format: { type: 'json_object' },
    [cfg.campoMaxTokens]: 24000,
  })

  const esperasEntreTentativas = [0, 3000]
  let res: Response
  let dados: OpenAiCompatResponse
  try {
    do {
      const espera = esperasEntreTentativas.shift()!
      if (espera) {
        if (msRestantes(inicio) <= espera) return tentativaTempoEsgotado(cfg.id)
        await new Promise((r) => setTimeout(r, espera))
      }
      res = await fetchComTeto(
        cfg.url,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: corpoRequisicao },
        inicio,
      )
      dados = (await res.json()) as OpenAiCompatResponse
    } while (res.status === 503 && esperasEntreTentativas.length > 0)
  } catch (err) {
    console.error(`gerar-aula: chamada à ${cfg.id} abortada/falhou:`, err instanceof Error ? err.message : err)
    return tentativaTempoEsgotado(cfg.id)
  }

  return { res, dados, provedor: cfg.id }
}

interface ProvedorConfig {
  provedor: 'gemini' | 'groq' | 'openrouter'
  chave: string
}

async function chamarProvedor(cfg: ProvedorConfig, promptTexto: string, inicio: number): Promise<Tentativa> {
  if (cfg.provedor === 'gemini') return chamarGemini(cfg.chave, promptTexto, inicio)
  return chamarOpenAiCompat(cfg.provedor === 'groq' ? GROQ : OPENROUTER, cfg.chave, promptTexto, inicio)
}

// Tenta cada provedor/chave da lista em ordem, passando pro próximo quando o
// anterior devolveu 503 (alta demanda), 429 (cota esgotada) ou 413 (pedido
// grande demais pro limite de tokens por minuto daquele provedor/modelo) —
// os três são específicos daquele provedor/chave/modelo, então trocar pode
// resolver os três (diferente de um erro 400, por exemplo, que se repetiria
// em qualquer chave). O 413 é comum em provedores com tier grátis: a Groq,
// por exemplo, limita openai/gpt-oss-120b a só 8000 tokens/minuto no
// on_demand — bem menos do que um PDF de estudo típico precisa, então cai
// pro próximo provedor da fila em vez de travar aqui. Devolve também com
// qual configuração deu certo, pra reusá-la no eventual reparo em vez de
// recomeçar a fila do zero.
// 599 é o nosso status sintético de "estourou o teto de tempo / falhou a
// rede" — também vale tentar o próximo provedor, que pode estar mais rápido.
const STATUS_TENTA_PROXIMO = new Set([413, 429, 503, STATUS_TEMPO_ESGOTADO])

async function chamarComReserva(
  provedores: ProvedorConfig[],
  promptTexto: string,
  inicio: number,
): Promise<{ tentativa: Tentativa; provedorUsado: ProvedorConfig }> {
  let ultima: { tentativa: Tentativa; provedorUsado: ProvedorConfig } | undefined
  for (const cfg of provedores) {
    // Sempre tenta pelo menos o primeiro provedor da lista, mesmo sem tempo
    // sobrando — só pula os seguintes quando já existe uma tentativa prévia.
    if (ultima && Date.now() - inicio > LIMITE_MS) break
    const tentativa = await chamarProvedor(cfg, promptTexto, inicio)
    if (!STATUS_TENTA_PROXIMO.has(tentativa.res.status)) {
      return { tentativa, provedorUsado: cfg }
    }
    ultima = { tentativa, provedorUsado: cfg }
  }
  return ultima!
}

interface ResultadoExtraido {
  texto: string
  bloqueadoMotivo?: string
  cortado?: boolean
  erroMensagem?: string
}

// Normaliza a resposta de qualquer um dos provedores pro mesmo formato, já
// que o Gemini tem uma forma de resposta bem diferente de Groq/OpenRouter (as
// duas seguem o mesmo formato compatível com OpenAI: "choices[0].message.content"
// em vez de "candidates[0].content.parts").
function extrairResultado(t: Tentativa): ResultadoExtraido {
  if (t.provedor === 'gemini') {
    const candidato = t.dados.candidates?.[0]
    return {
      texto: candidato?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      bloqueadoMotivo: t.dados.promptFeedback?.blockReason,
      cortado: candidato?.finishReason === 'MAX_TOKENS',
      erroMensagem: t.dados.error?.message,
    }
  }
  const escolha = t.dados.choices?.[0]
  return {
    texto: escolha?.message?.content ?? '',
    bloqueadoMotivo: escolha?.finish_reason === 'content_filter' ? 'content_filter' : undefined,
    cortado: escolha?.finish_reason === 'length',
    erroMensagem: t.dados.error?.message,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const inicio = Date.now()
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

  // Ordem de prioridade da cascata (pedida explicitamente pelo usuário):
  // 1) Gemini principal (chave própria do usuário, evitando fila
  //    compartilhada, + GEMINI_API_KEY da plataforma)
  // 2) OpenRouter
  // 3) Groq
  // 4) Gemini reserva (GEMINI_API_KEY_RESERVA) — por último
  // Cada item é opcional: sem nenhuma configuração extra, o comportamento é
  // o mesmo de sempre (só a chave do usuário e/ou GEMINI_API_KEY).
  // GEMINI_API_KEY_RESERVA, GROQ_API_KEY e OPENROUTER_API_KEY aceitam mais
  // de uma chave, separadas por vírgula ou quebra de linha — pra adicionar
  // mais reservas basta colar outra chave na mesma variável na Vercel, sem
  // precisar mexer no código.
  const dividirChaves = (valor: string | undefined) =>
    (valor ?? '')
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter(Boolean)

  const chavesGeminiPrincipal = Array.from(
    new Set([...(chaveUsuario?.trim() ? [chaveUsuario.trim()] : []), ...dividirChaves(process.env.GEMINI_API_KEY)]),
  )
  const chavesGeminiReserva = Array.from(new Set(dividirChaves(process.env.GEMINI_API_KEY_RESERVA)))
  const chavesGroq = Array.from(new Set(dividirChaves(process.env.GROQ_API_KEY)))
  const chavesOpenRouter = Array.from(new Set(dividirChaves(process.env.OPENROUTER_API_KEY)))

  const provedoresBrutos: ProvedorConfig[] = [
    ...chavesGeminiPrincipal.map((chave): ProvedorConfig => ({ provedor: 'gemini', chave })),
    ...chavesOpenRouter.map((chave): ProvedorConfig => ({ provedor: 'openrouter' as const, chave })),
    ...chavesGroq.map((chave): ProvedorConfig => ({ provedor: 'groq' as const, chave })),
    ...chavesGeminiReserva.map((chave): ProvedorConfig => ({ provedor: 'gemini' as const, chave })),
  ]
  // Remove duplicatas exatas (mesmo provedor + mesma chave) que possam
  // aparecer em mais de uma variável de ambiente, mantendo a 1ª posição —
  // agora que o Gemini está em dois grupos separados (principal e reserva),
  // uma chave repetida entre eles não deve ser tentada duas vezes.
  const vistos = new Set<string>()
  const provedores = provedoresBrutos.filter((p) => {
    const chaveUnica = `${p.provedor}:${p.chave}`
    if (vistos.has(chaveUnica)) return false
    vistos.add(chaveUnica)
    return true
  })
  if (provedores.length === 0) {
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
      tamanhoExcessivo: true,
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

    const { tentativa, provedorUsado } = await chamarComReserva(provedores, userText, inicio)
    const iaRes = tentativa.res

    if (!iaRes.ok) {
      if (iaRes.status === 429) {
        res.status(429).json({
          ok: false,
          error:
            provedores.length > 1
              ? 'Todas as chaves/provedores de IA configurados estão sem cota gratuita agora (já tentei todos automaticamente, incluindo a reserva). Tente de novo mais tarde.'
              : provedorUsado.provedor === 'gemini'
                ? chaveUsuario
                  ? 'Cota gratuita da sua chave do Gemini esgotada por agora. Tente novamente em alguns minutos.'
                  : 'Cota gratuita compartilhada do Gemini esgotada por agora. Adicione sua própria chave grátis em "Perfil" pra não depender dela, ou tente de novo mais tarde.'
                : `Cota gratuita do provedor de reserva (${provedorUsado.provedor === 'groq' ? 'Groq' : 'OpenRouter'}) esgotada por agora. Tente novamente mais tarde.`,
        })
        return
      }
      if (iaRes.status === 503) {
        res.status(503).json({
          ok: false,
          error:
            provedores.length > 1
              ? 'A IA está com alta demanda agora, mesmo já tentando de novo automaticamente e testando mais de uma chave/provedor (incluindo a reserva). Espera um pouco e tenta de novo.'
              : chaveUsuario
                ? 'O modelo de IA está com alta demanda no Google agora (já tentei de novo automaticamente). Espera um pouco e tenta de novo.'
                : 'O modelo de IA está com alta demanda no Google agora, mesmo já tentando de novo automaticamente. Adicionar sua própria chave grátis em "Perfil" costuma resolver, já que ela não compete com a de outros usuários.',
        })
        return
      }
      if (iaRes.status === 413) {
        res.status(413).json({
          ok: false,
          error:
            'Este PDF é grande demais para os provedores de reserva gratuitos configurados (eles têm um limite de tokens por minuto bem menor que o Gemini). Tente dividir o PDF em partes menores, ou tente de novo — se a chave principal do Gemini estiver disponível, ela costuma dar conta de PDFs maiores.',
          tamanhoExcessivo: true,
        })
        return
      }
      if (iaRes.status === STATUS_TEMPO_ESGOTADO) {
        // Nenhum provedor conseguiu responder dentro do tempo que a função
        // tem na Vercel. Antes essa situação matava a função no meio e
        // devolvia HTML ("resposta não veio em JSON"); agora desistimos
        // sozinhos a tempo e explicamos o que fazer.
        res.status(504).json({
          ok: false,
          error:
            'A IA demorou mais do que o tempo disponível para responder (o servidor tem 1 minuto por pedido). Isso costuma acontecer quando o trecho enviado é grande demais — dividir o PDF em mais partes resolve.',
          tamanhoExcessivo: true,
        })
        return
      }
      const extraidoErro = extrairResultado(tentativa)
      console.error('gerar-aula: IA retornou erro:', provedorUsado.provedor, iaRes.status, extraidoErro.erroMensagem)
      res.status(502).json({ ok: false, error: extraidoErro.erroMensagem || 'A IA recusou o pedido. Tente novamente.' })
      return
    }

    const extraido = extrairResultado(tentativa)

    if (extraido.bloqueadoMotivo) {
      res.status(502).json({ ok: false, error: `A IA bloqueou o conteúdo (motivo: ${extraido.bloqueadoMotivo}).` })
      return
    }
    if (extraido.cortado) {
      res.status(502).json({
        ok: false,
        error: 'A aula gerada ficou grande demais e foi cortada. Tente dividir o PDF em partes menores.',
        tamanhoExcessivo: true,
      })
      return
    }

    let textoResposta = extraido.texto
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

      // Reparo é mais uma chamada de geração inteira — sem tempo sobrando,
      // é melhor devolver um erro claro nosso do que arriscar estourar os
      // 60s da função e a Vercel devolver uma página de erro sem JSON.
      if (Date.now() - inicio > LIMITE_MS) {
        res.status(502).json({
          ok: false,
          error: 'A IA devolveu um formato inválido e não deu tempo de corrigir automaticamente (PDF grande demais). Tente de novo ou divida o PDF em partes menores.',
          tamanhoExcessivo: true,
        })
        return
      }

      const promptReparo = [
        userText,
        '--- TENTATIVA ANTERIOR (INVÁLIDA) ---',
        textoResposta,
        '--- ERROS DE ESTRUTURA ENCONTRADOS ---',
        erros.join('\n'),
        'Corrija SOMENTE esses problemas estruturais no JSON acima. Não altere o conteúdo pedagógico, não remova nem invente questões, não invente informação que não estava lá. Devolva o JSON corrigido completo, com a mesma estrutura geral.',
      ].join('\n\n')

      const reparo = await chamarProvedor(provedorUsado, promptReparo, inicio)
      if (!reparo.res.ok) {
        res.status(502).json({ ok: false, error: 'A IA devolveu um formato inválido e a correção automática falhou. Tente novamente.' })
        return
      }
      textoResposta = extrairResultado(reparo).texto
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
