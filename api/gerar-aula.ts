import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AulaGeradaIntermediateSchema, TIPOS_BLOCO_IA } from '../src/lib/aiIntermediateSchema.js'
import { SYSTEM_PROMPT_GERAR_AULA } from '../src/lib/aiPrompt.js'
import { AulaGeradaSchema } from '../src/lib/aiSchema.js'
import { compilarAulas } from '../src/lib/lessonCompiler.js'
import { extrairJson, normalizarSaidaIA } from '../src/lib/ai/normalizarSaidaIA.js'

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
  id: 'groq' | 'openrouter' | 'aimlapi'
  url: string
  model: string
  campoMaxTokens: 'max_completion_tokens' | 'max_tokens'
  // A OpenRouter aceita `response_format: json_schema`, que faz o roteador
  // dela escolher um modelo capaz de respeitar a estrutura — bem melhor que
  // só pedir "JSON válido". Na Groq mantemos `json_object`, que é o modo
  // confirmado como suportado pelos gpt-oss.
  aceitaJsonSchema: boolean
  // Teto de saída próprio. A Groq no plano grátis limita 8000 tokens POR
  // MINUTO e conta o teto pedido dentro dessa conta — o erro dela era
  // literalmente "Limit 8000, Requested 59822". Pedindo menos, ela passa a
  // caber no próprio limite e vira uma opção útil: é de longe a mais rápida
  // das três (roda em hardware dedicado a inferência).
  maxTokensSaida: number
}

const GROQ: ProvedorOpenAiCompat = {
  id: 'groq',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'openai/gpt-oss-120b',
  campoMaxTokens: 'max_completion_tokens',
  aceitaJsonSchema: false,
  maxTokensSaida: 4000,
}

// A OpenRouter documenta seu próprio parâmetro normalizado como "max_tokens"
// (ela é um proxy pra vários backends diferentes) — diferente da Groq, que é
// diretamente compatível com a API da OpenAI e usa "max_completion_tokens".
const OPENROUTER: ProvedorOpenAiCompat = {
  id: 'openrouter',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'openrouter/free',
  campoMaxTokens: 'max_tokens',
  aceitaJsonSchema: true,
  maxTokensSaida: 12000,
}

// AI/ML API: agregador que expõe vários modelos atrás de uma API única, no
// mesmo formato compatível com OpenAI. O modelo vem de variável de ambiente
// (AIMLAPI_MODEL) porque o catálogo deles é grande e muda — o padrão abaixo é
// exatamente o que aparece no exemplo de onboarding da própria plataforma, e
// trocar não exige mexer no código.
const AIMLAPI: ProvedorOpenAiCompat = {
  id: 'aimlapi',
  url: 'https://api.aimlapi.com/v1/chat/completions',
  model: process.env.AIMLAPI_MODEL?.trim() || 'openai/gpt-5-5',
  campoMaxTokens: 'max_tokens',
  aceitaJsonSchema: true,
  maxTokensSaida: 12000,
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
  | { res: Response; provedor: 'aimlapi'; dados: OpenAiCompatResponse }

// Teto de execução da função na Vercel, definido em vercel.json.
//
// Estava em 60s por um engano meu: 60s era o limite ANTIGO. Com o Fluid
// Compute — padrão em projetos novos da Vercel desde abr/2025 e disponível
// no plano Hobby — o teto é 300s. O diagnóstico de produção mostrou a
// OpenRouter levando 45,9s e sendo cortada; com 300s ela cabe com folga.
// Se este número mudar em vercel.json, mude aqui junto.
const MAX_DURACAO_VERCEL_MS = 300_000

// Nosso limite de trabalho, sempre abaixo do teto da plataforma pra que
// sejamos NÓS a desistir (respondendo JSON) e não a Vercel a nos encerrar
// (respondendo uma página HTML de erro, que o app não consegue interpretar).
const LIMITE_MS = MAX_DURACAO_VERCEL_MS - 40_000

// Reserva final garantida pra compilar/validar/serializar a resposta depois
// que a IA responde — nenhuma chamada externa pode consumir esse naco.
const RESERVA_RESPOSTA_MS = 10_000

/** Status sintético (não vem de nenhum provedor) pra "estourou o nosso próprio teto de tempo". */
const STATUS_TEMPO_ESGOTADO = 599

// Teto de escrita. Note que, com "pensamento" ligado, os tokens de raciocínio
// interno TAMBÉM contam aqui — por isso um teto muito baixo pode fazer o
// modelo gastar a cota pensando e devolver resposta vazia/cortada.
const MAX_TOKENS_SAIDA = 12000

/**
 * CAUSA PRINCIPAL DA LENTIDÃO QUE FAZIA A IMPORTAÇÃO ESTOURAR O TEMPO.
 *
 * Os modelos Flash atuais do Gemini vêm com "pensamento" (raciocínio interno)
 * LIGADO por padrão: antes de escrever qualquer coisa da resposta, o modelo
 * gera um monte de tokens internos. Isso multiplica a latência e ainda
 * consome `maxOutputTokens` — ou seja, além de demorar, pode sobrar pouco
 * espaço pra resposta de verdade.
 *
 * Desligar/minimizar resolve, mas o parâmetro MUDA conforme a geração do
 * modelo, e misturar dá erro 400:
 *   - Gemini 3.x  -> generationConfig.thinkingConfig.thinkingLevel: "minimal"
 *   - Gemini 2.5  -> generationConfig.thinkingConfig.thinkingBudget: 0
 *
 * Como usamos o alias flutuante `gemini-flash-latest` de propósito (pra não
 * fixar um modelo que sai de linha), não dá pra saber de antemão qual
 * geração vai atender. Então sondamos: tentamos a variante do Gemini 3,
 * e se vier 400 tentamos a do 2.5, e por fim sem nada. Um 400 falha na hora
 * (o modelo nem começa a gerar), então a sondagem custa quase nada — e o
 * resultado fica lembrado na instância, que a Vercel reaproveita entre
 * pedidos enquanto está quente.
 */
type VarianteThinking = 'gemini3' | 'gemini25' | 'nenhuma'

const VARIANTES_THINKING: VarianteThinking[] = ['gemini3', 'gemini25', 'nenhuma']

function configThinking(variante: VarianteThinking): Record<string, unknown> {
  if (variante === 'gemini3') return { thinkingConfig: { thinkingLevel: 'minimal' } }
  if (variante === 'gemini25') return { thinkingConfig: { thinkingBudget: 0 } }
  return {}
}

let varianteThinkingConhecida: VarianteThinking | null = null

function msRestantes(inicio: number): number {
  return LIMITE_MS - RESERVA_RESPOSTA_MS - (Date.now() - inicio)
}

/**
 * `fetch` + leitura do corpo com teto de tempo próprio, calculado pelo que
 * ainda sobra do orçamento da função.
 *
 * ATENÇÃO ao detalhe que já causou bug aqui: `fetch()` resolve quando chegam
 * os CABEÇALHOS, não quando o corpo termina. A versão anterior desarmava o
 * timer (`clearTimeout`) assim que o fetch resolvia e só então lia o corpo —
 * deixando a leitura do corpo SEM teto algum. E é exatamente aí que uma API
 * de IA demora: ela devolve "200 OK" rápido e leva muito tempo gerando o
 * texto. Resultado: o abort nunca disparava e a função batia no limite da
 * plataforma.
 *
 * Por isso o corpo é lido AQUI DENTRO, ainda sob o mesmo AbortController: o
 * timer só é desarmado depois que a resposta inteira chegou.
 */
async function postJsonComTeto<T>(url: string, opcoes: RequestInit, inicio: number): Promise<{ res: Response; dados: T }> {
  const restante = msRestantes(inicio)
  if (restante <= 0) throw new Error('Sem orçamento de tempo restante para chamar a IA.')

  const controlador = new AbortController()
  const timer = setTimeout(() => controlador.abort(), restante)
  try {
    const res = await fetch(url, { ...opcoes, signal: controlador.signal })
    const dados = (await res.json()) as T
    return { res, dados }
  } finally {
    clearTimeout(timer)
  }
}

/** Resposta sintética usada quando a chamada foi abortada/falhou na rede — faz a cascata seguir pro próximo provedor. */
function tentativaTempoEsgotado(provedor: ProvedorConfig['provedor']): Tentativa {
  const res = new Response(null, { status: STATUS_TEMPO_ESGOTADO })
  return provedor === 'gemini'
    ? { res, provedor: 'gemini', dados: {} }
    : { res, provedor: provedor as 'groq' | 'openrouter' | 'aimlapi', dados: {} }
}

async function chamarGemini(apiKey: string, promptTexto: string, inicio: number): Promise<Tentativa> {
  const montarCorpo = (variante: VarianteThinking) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT_GERAR_AULA }] },
      contents: [{ role: 'user', parts: [{ text: promptTexto }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: AULA_GERADA_JSON_SCHEMA,
        maxOutputTokens: MAX_TOKENS_SAIDA,
        ...configThinking(variante),
      },
    })

  // Ordem de sondagem: começa pela variante que já sabemos que funciona (a
  // instância serverless é reaproveitada entre pedidos quando está quente),
  // mas mantém as outras na fila — assim, se o alias `gemini-flash-latest`
  // passar a apontar pra outra geração, a sondagem se reajusta sozinha em
  // vez de falhar pra sempre nessa instância.
  const candidatas = varianteThinkingConhecida
    ? [varianteThinkingConhecida, ...VARIANTES_THINKING.filter((v) => v !== varianteThinkingConhecida)]
    : VARIANTES_THINKING

  // O modelo Flash gratuito às vezes devolve 503 "high demand" em pico de
  // uso — geralmente passa em poucos segundos, então tenta de novo antes
  // de desistir. Backoff curto de propósito: com o reparo (uma segunda
  // chamada possível), o tempo total ainda precisa caber nos 60s da função.
  const esperasEntreTentativas = [0, 3000]
  let res: Response
  let dados: GeminiResponse
  try {
    for (const variante of candidatas) {
      const corpoRequisicao = montarCorpo(variante)
      const esperas = [...esperasEntreTentativas]
      do {
        const espera = esperas.shift()!
        // Só espera pra tentar de novo se ainda sobrar tempo pra isso valer a pena.
        if (espera) {
          if (msRestantes(inicio) <= espera) return tentativaTempoEsgotado('gemini')
          await new Promise((r) => setTimeout(r, espera))
        }
        ;({ res, dados } = await postJsonComTeto<GeminiResponse>(
          GEMINI_URL,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: corpoRequisicao },
          inicio,
        ))
      } while (res.status === 503 && esperas.length > 0)

      // 400 = parâmetro de pensamento incompatível com a geração deste
      // modelo. Isso falha na hora (nem começa a gerar), então sondar a
      // próxima variante custa quase nada de tempo.
      if (res.status === 400 && variante !== 'nenhuma') {
        console.error(`gerar-aula: Gemini recusou a variante de pensamento "${variante}" (400) — tentando a próxima`)
        if (varianteThinkingConhecida === variante) varianteThinkingConhecida = null
        continue
      }

      // Só memoriza em caso de sucesso de verdade: um 429 (cota) ou 503
      // (sobrecarga) não prova que esta variante é a certa pro modelo.
      if (res.ok) varianteThinkingConhecida = variante
      return { res, dados, provedor: 'gemini' }
    }
    // Todas as variantes foram recusadas — devolve a última resposta.
    return { res: res!, dados: dados!, provedor: 'gemini' }
  } catch (err) {
    // Abortado pelo nosso teto de tempo, ou falha de rede — nos dois casos
    // vale tentar o próximo provedor da fila em vez de derrubar o pedido.
    console.error('gerar-aula: chamada ao Gemini abortada/falhou:', err instanceof Error ? err.message : err)
    return tentativaTempoEsgotado('gemini')
  }
}

async function chamarOpenAiCompat(cfg: ProvedorOpenAiCompat, apiKey: string, promptTexto: string, inicio: number): Promise<Tentativa> {
  const corpoRequisicao = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_GERAR_AULA + SUFIXO_JSON_MODO_OBJETO },
      { role: 'user', content: promptTexto },
    ],
    response_format: cfg.aceitaJsonSchema
      ? { type: 'json_schema', json_schema: { name: 'aula_gerada', strict: true, schema: AULA_GERADA_JSON_SCHEMA } }
      : { type: 'json_object' },
    [cfg.campoMaxTokens]: cfg.maxTokensSaida,
    // Mesmo problema do "pensamento" do Gemini: os modelos gpt-oss da Groq
    // são modelos de raciocínio e vêm com reasoning_effort "medium" por
    // padrão, o que gasta tempo antes de escrever a resposta. Aqui a tarefa
    // é reescrever material que já está no texto, não resolver um problema
    // difícil — então "low" entrega o mesmo resultado bem mais rápido.
    // Só a Groq documenta esse parâmetro pros gpt-oss; na OpenRouter o
    // modelo é sorteado entre vários, então não mandamos nada.
    ...(cfg.id === 'groq' ? { reasoning_effort: 'low' } : {}),
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
      ;({ res, dados } = await postJsonComTeto<OpenAiCompatResponse>(
        cfg.url,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: corpoRequisicao },
        inicio,
      ))
    } while (res.status === 503 && esperasEntreTentativas.length > 0)
  } catch (err) {
    console.error(`gerar-aula: chamada à ${cfg.id} abortada/falhou:`, err instanceof Error ? err.message : err)
    return tentativaTempoEsgotado(cfg.id)
  }

  return { res, dados, provedor: cfg.id }
}

interface ProvedorConfig {
  provedor: 'gemini' | 'groq' | 'openrouter' | 'aimlapi'
  chave: string
}

async function chamarProvedor(cfg: ProvedorConfig, promptTexto: string, inicio: number): Promise<Tentativa> {
  if (cfg.provedor === 'gemini') return chamarGemini(cfg.chave, promptTexto, inicio)
  const compat = cfg.provedor === 'groq' ? GROQ : cfg.provedor === 'aimlapi' ? AIMLAPI : OPENROUTER
  return chamarOpenAiCompat(compat, cfg.chave, promptTexto, inicio)
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

/** Nome legível de cada provedor, pra mensagens de erro e diagnóstico. */
const NOME_PROVEDOR: Record<ProvedorConfig['provedor'], string> = {
  gemini: 'Gemini',
  aimlapi: 'AI/ML API',
  openrouter: 'OpenRouter',
  groq: 'Groq',
}

// Quanto esperamos por um provedor antes de colocar o PRÓXIMO pra trabalhar
// em paralelo com ele. Ver `chamarComReserva`.
//
// 15s é o meio-termo: um provedor rápido (Groq, Gemini com cota) responde bem
// dentro disso e nenhum outro chega a ser acionado — sem desperdício de cota.
// Passou de 15s, é sinal de que aquele provedor está devagar, e aí compensa
// pôr o próximo pra correr junto em vez de esperar parado.
const ATRASO_PARALELO_MS = 15_000

/**
 * Aciona os provedores de forma escalonada e fica com a PRIMEIRA resposta boa.
 *
 * Antes isso era uma fila estrita: só chamava o segundo provedor depois que o
 * primeiro terminasse. O problema é que o modo de falha mais comum aqui não é
 * "o provedor recusou" (rápido), e sim "o provedor está lento" — e nesse caso
 * o primeiro da fila sozinho consumia todo o orçamento de tempo, e os outros
 * nem chegavam a ser tentados. Era garantia de estourar o tempo sempre que o
 * provedor principal estivesse ruim.
 *
 * Agora: o primeiro provedor começa na hora; se em ATRASO_PARALELO_MS ele
 * ainda não respondeu, o próximo entra EM PARALELO (e assim por diante).
 * Quem responder primeiro com algo aproveitável vence, e os demais são
 * descartados. O tempo total passa a ser o do provedor MAIS RÁPIDO, em vez da
 * soma dos lentos.
 *
 * Um provedor que falha rápido (cota, sobrecarga) também adianta o próximo na
 * hora, sem esperar o escalonamento. E no caminho feliz — resposta rápida do
 * primeiro — nenhum provedor extra chega a ser acionado, então não há
 * desperdício de cota.
 */
async function chamarComReserva(
  provedores: ProvedorConfig[],
  promptTexto: string,
  inicio: number,
  // Registro de quanto cada provedor demorou e com que resultado. Vai pra
  // mensagem de erro quando nada dá certo: sem isso, "demorou demais" não
  // diz QUEM demorou, e a investigação vira adivinhação.
  diagnostico: string[] = [],
): Promise<{ tentativa: Tentativa; provedorUsado: ProvedorConfig }> {
  return new Promise((resolve) => {
    let resolvido = false
    let lancados = 0
    let emVoo = 0
    let ultima: { tentativa: Tentativa; provedorUsado: ProvedorConfig } | undefined
    const timers: ReturnType<typeof setTimeout>[] = []

    const encerrar = (resultado: { tentativa: Tentativa; provedorUsado: ProvedorConfig }) => {
      if (resolvido) return
      resolvido = true
      timers.forEach(clearTimeout)
      resolve(resultado)
    }

    const lancarProximo = () => {
      if (resolvido || lancados >= provedores.length) return
      // Sem orçamento pra mais uma chamada: deixa as que já estão em voo
      // terminarem em vez de abrir outra que não teria tempo de responder.
      if (lancados > 0 && msRestantes(inicio) <= 0) return

      const cfg = provedores[lancados++]
      emVoo++
      const antes = Date.now()

      chamarProvedor(cfg, promptTexto, inicio)
        .then((tentativa) => {
          const segundos = ((Date.now() - antes) / 1000).toFixed(1)
          const rotulo = tentativa.res.status === STATUS_TEMPO_ESGOTADO ? 'tempo esgotado' : String(tentativa.res.status)
          diagnostico.push(`${NOME_PROVEDOR[cfg.provedor]} ${segundos}s (${rotulo})`)

          if (STATUS_TENTA_PROXIMO.has(tentativa.res.status)) {
            // Falhou de um jeito que outro provedor pode resolver: guarda como
            // último recurso e adianta o próximo agora, sem esperar o relógio.
            ultima = { tentativa, provedorUsado: cfg }
            lancarProximo()
            return
          }
          encerrar({ tentativa, provedorUsado: cfg })
        })
        .catch((err) => {
          console.error(`gerar-aula: falha inesperada no provedor ${cfg.provedor}:`, err)
          diagnostico.push(`${cfg.provedor} (falha inesperada)`)
          lancarProximo()
        })
        .finally(() => {
          emVoo--
          // Todos terminaram e nenhum serviu: devolve a última tentativa, que
          // carrega o status usado pra montar a mensagem de erro certa.
          if (!resolvido && emVoo === 0 && lancados >= provedores.length && ultima) encerrar(ultima)
        })

      // Escalona o próximo pra entrar em paralelo se este demorar.
      if (lancados < provedores.length) timers.push(setTimeout(lancarProximo, ATRASO_PARALELO_MS))
    }

    lancarProximo()
  })
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

/** Envia a resposta ao cliente. Injetado no processamento pra garantir uma única resposta por pedido. */
type Responder = (status: number, corpo: unknown) => void

// Momento em que a rede de segurança responde de qualquer jeito. Fica abaixo
// do teto da plataforma com folga pra resposta ser enviada.
const RESPOSTA_GARANTIDA_MS = MAX_DURACAO_VERCEL_MS - 20_000

/**
 * Rede de segurança final contra FUNCTION_INVOCATION_TIMEOUT.
 *
 * Os tetos de tempo por requisição (`postJsonComTeto`) já deveriam bastar, mas
 * se alguma chamada externa travar de um jeito que o AbortController não
 * interrompa, a Vercel encerra a função e o navegador recebe uma página HTML
 * de erro — ilegível pro usuário e impossível de tratar no cliente. Aqui
 * garantimos que SEMPRE sai um JSON nosso antes disso: se o prazo estourar,
 * respondemos na hora e deixamos o trabalho pendente morrer sozinho.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let respondido = false
  const responder: Responder = (status, corpo) => {
    if (respondido) return
    respondido = true
    res.status(status).json(corpo)
  }

  const salvaVidas = setTimeout(() => {
    console.error('gerar-aula: rede de segurança acionada — respondendo antes do limite da plataforma')
    responder(504, {
      ok: false,
      error:
        'A IA não terminou de escrever dentro do tempo que o servidor tem por pedido. Tente de novo — se repetir, divida o PDF em partes menores.',
      tamanhoExcessivo: true,
    })
  }, RESPOSTA_GARANTIDA_MS)

  try {
    await processarPedido(req, responder)
  } catch (err) {
    console.error('gerar-aula falhou (nível externo):', err)
    responder(502, { ok: false, error: err instanceof Error ? err.message : 'Erro inesperado ao gerar a aula.' })
  } finally {
    clearTimeout(salvaVidas)
  }
}

async function processarPedido(req: VercelRequest, responder: Responder) {
  const inicio = Date.now()
  if (req.method !== 'POST') {
    responder(405, { ok: false, error: 'Método não permitido.' })
    return
  }

  const { texto, materiaOverride, nomeArquivo, chaveUsuario } = (req.body ?? {}) as {
    texto?: string
    materiaOverride?: string
    nomeArquivo?: string
    chaveUsuario?: string
  }

  // Ordem de prioridade da cascata. Vale lembrar que hoje ela é uma ordem de
  // LARGADA, não uma fila: quem não responde rápido ganha companhia em
  // paralelo, e o primeiro a entregar vence (ver `chamarComReserva`).
  // 1) Gemini principal (chave própria do usuário, evitando fila
  //    compartilhada, + GEMINI_API_KEY da plataforma)
  // 2) AI/ML API
  // 3) OpenRouter
  // 4) Groq
  // 5) Gemini reserva (GEMINI_API_KEY_RESERVA) — por último
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
  const chavesAimlapi = Array.from(new Set(dividirChaves(process.env.AIMLAPI_API_KEY)))
  const chavesOpenRouter = Array.from(new Set(dividirChaves(process.env.OPENROUTER_API_KEY)))

  const provedoresBrutos: ProvedorConfig[] = [
    ...chavesGeminiPrincipal.map((chave): ProvedorConfig => ({ provedor: 'gemini', chave })),
    ...chavesAimlapi.map((chave): ProvedorConfig => ({ provedor: 'aimlapi' as const, chave })),
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
    responder(500, {
      ok: false,
      error:
        'IA não configurada. Adicione sua própria chave gratuita do Gemini em "Perfil", ou peça pro administrador configurar GEMINI_API_KEY no servidor.',
    })
    return
  }

  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    responder(400, { ok: false, error: 'Texto do PDF vazio ou ausente.' })
    return
  }
  if (texto.length > MAX_TEXTO_CHARS) {
    responder(400, {
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

    const diagnostico: string[] = []
    const { tentativa, provedorUsado } = await chamarComReserva(provedores, userText, inicio, diagnostico)
    const iaRes = tentativa.res

    if (!iaRes.ok) {
      if (iaRes.status === 429) {
        responder(429, {
          ok: false,
          error:
            provedores.length > 1
              ? 'Todas as chaves/provedores de IA configurados estão sem cota gratuita agora (já tentei todos automaticamente, incluindo a reserva). Tente de novo mais tarde.'
              : provedorUsado.provedor === 'gemini'
                ? chaveUsuario
                  ? 'Cota gratuita da sua chave do Gemini esgotada por agora. Tente novamente em alguns minutos.'
                  : 'Cota gratuita compartilhada do Gemini esgotada por agora. Adicione sua própria chave grátis em "Perfil" pra não depender dela, ou tente de novo mais tarde.'
                : `Cota do provedor de reserva (${NOME_PROVEDOR[provedorUsado.provedor]}) esgotada por agora. Tente novamente mais tarde.`,
        })
        return
      }
      if (iaRes.status === 503) {
        responder(503, {
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
        responder(413, {
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
        responder(504, {
          ok: false,
          error: `A IA demorou mais do que o tempo disponível para responder. Tentativas: ${diagnostico.join(' · ')}.`,
          tamanhoExcessivo: true,
        })
        return
      }
      const extraidoErro = extrairResultado(tentativa)
      console.error('gerar-aula: IA retornou erro:', provedorUsado.provedor, iaRes.status, extraidoErro.erroMensagem)
      responder(502, { ok: false, error: extraidoErro.erroMensagem || 'A IA recusou o pedido. Tente novamente.' })
      return
    }

    const extraido = extrairResultado(tentativa)

    if (extraido.bloqueadoMotivo) {
      responder(502, { ok: false, error: `A IA bloqueou o conteúdo (motivo: ${extraido.bloqueadoMotivo}).` })
      return
    }
    if (extraido.cortado) {
      responder(502, {
        ok: false,
        error: 'A aula gerada ficou grande demais e foi cortada. Tente dividir o PDF em partes menores.',
        tamanhoExcessivo: true,
      })
      return
    }

    let textoResposta = extraido.texto
    if (!textoResposta) {
      responder(502, { ok: false, error: 'A IA não devolveu nenhum conteúdo. Tente novamente.' })
      return
    }

    let bruto: unknown
    try {
      bruto = JSON.parse(extrairJson(textoResposta))
    } catch {
      responder(502, { ok: false, error: 'A IA devolveu um JSON inválido. Tente novamente.' })
      return
    }

    // Acerta a embalagem antes de validar: campo omitido em vez de vazio, ano
    // como número, alternativas como objeto... A IA costuma acertar o
    // conteúdo e errar a forma, e rejeitar isso jogaria fora uma geração boa.
    let validado = AulaGeradaIntermediateSchema.safeParse(normalizarSaidaIA(bruto, materiaOverride))

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
        responder(502, {
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
        responder(502, { ok: false, error: 'A IA devolveu um formato inválido e a correção automática falhou. Tente novamente.' })
        return
      }
      textoResposta = extrairResultado(reparo).texto
      try {
        bruto = JSON.parse(extrairJson(textoResposta))
      } catch {
        responder(502, { ok: false, error: 'A IA devolveu um JSON inválido mesmo após a correção. Tente novamente.' })
        return
      }
      validado = AulaGeradaIntermediateSchema.safeParse(normalizarSaidaIA(bruto, materiaOverride))
      if (!validado.success) {
        const errosFinais = validado.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
        console.error('gerar-aula: saída ainda inválida após reparo:', validado.error.flatten())
        // Mostra o que exatamente ficou fora do formato — sem isso, "formato
        // inesperado" não diz qual campo, e a investigação vira adivinhação.
        responder(502, { ok: false, error: `A IA devolveu dados em formato inesperado, mesmo após tentar corrigir. Detalhes: ${errosFinais.join('; ')}.` })
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
      responder(502, { ok: false, error: 'Erro interno ao montar a aula. Tente novamente.' })
      return
    }

    responder(200, { ok: true, payload: aulasValidadas.map((v) => (v.success ? v.data : null)) })
  } catch (err) {
    console.error('gerar-aula falhou:', err)
    const mensagem = err instanceof Error ? err.message : 'Erro inesperado ao gerar a aula.'
    responder(502, { ok: false, error: mensagem })
  }
}
