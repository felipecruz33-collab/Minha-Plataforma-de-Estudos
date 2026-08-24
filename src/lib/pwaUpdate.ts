import { registerSW } from 'virtual:pwa-register'

/**
 * Detecção e aplicação de nova versão do app instalado (PWA).
 *
 * ## Por que a versão antiga ficava presa
 *
 * A configuração anterior juntava três coisas que se anulam:
 *
 *   - `registerType: 'autoUpdate'`, que faz o plugin gerar um Service Worker
 *     que se instala e assume o controle sozinho;
 *   - `skipWaiting: true`, que faz o Service Worker novo NUNCA ficar em
 *     espera — e é justamente o estado "em espera" que dispara o aviso
 *     `onNeedRefresh`;
 *   - `injectRegister: false`, que troca o script de registro automático do
 *     plugin (o qual recarrega a página quando o controle muda) por este
 *     registro manual, que não recarregava nada.
 *
 * O resultado: o Service Worker novo era baixado e assumia o controle, mas a
 * página JÁ ABERTA continuava rodando o JavaScript antigo que estava na
 * memória. `onNeedRefresh` nunca era chamado, porque nada ficava em espera —
 * então o `updateServiceWorker(true)` que existia dentro dele também nunca
 * rodava. Na prática, o app só mudava de versão quando o sistema operacional
 * descartava o processo inteiro.
 *
 * ## Como funciona agora
 *
 * O Service Worker novo espera (sem `skipWaiting`), o que faz `onNeedRefresh`
 * disparar de verdade. Aí o app mostra um aviso e quem decide a hora é o
 * usuário — recarregar sozinho no meio de uma importação de PDF, ou no meio
 * de um simulado, perderia trabalho de verdade.
 *
 * Quem nunca tocar no aviso também não fica preso: o Service Worker em espera
 * assume assim que o app é fechado e aberto de novo.
 */

type Ouvinte = (temAtualizacao: boolean) => void

const ouvintes = new Set<Ouvinte>()
let atualizacaoPendente = false
let aplicar: ((recarregar?: boolean) => Promise<void>) | null = null
let registro: ServiceWorkerRegistration | null = null

function avisar() {
  for (const ouvinte of ouvintes) ouvinte(atualizacaoPendente)
}

/** Avisa quando uma nova versão estiver pronta pra ser aplicada. Devolve a função de cancelar. */
export function assinarAtualizacao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  ouvinte(atualizacaoPendente)
  return () => ouvintes.delete(ouvinte)
}

let recarregando = false

/** Recarrega uma vez só, venha o gatilho de onde vier. */
function recarregar() {
  if (recarregando) return
  recarregando = true
  window.location.reload()
}

/**
 * Aplica a nova versão e recarrega a página.
 *
 * O recarregamento é feito aqui, e não deixado por conta da biblioteca.
 * Medindo o ciclo real no navegador, o `updateServiceWorker(true)` do
 * vite-plugin-pwa de fato tirava o Service Worker novo da espera (dá pra ver
 * o estado `waiting` virar falso), mas a página não recarregava — e sem
 * recarregar, o JavaScript antigo continua na memória e o usuário não vê
 * diferença nenhuma. Ou seja: era o mesmo sintoma de antes, só que um passo
 * mais adiante.
 *
 * Então esperamos o `controllerchange`, que é o evento do próprio navegador
 * dizendo "o Service Worker novo assumiu", e recarregamos aí. O prazo é uma
 * rede de segurança: se o evento não vier, recarregar mesmo assim é seguro,
 * porque a essa altura a versão nova já está instalada e é ela que vai
 * responder.
 */
export async function aplicarAtualizacao(recarregarDepois = true): Promise<void> {
  if (!aplicar || !('serviceWorker' in navigator)) {
    // Sem Service Worker (navegador sem suporte, ou aba servida em http),
    // recarregar já basta pra buscar os arquivos novos.
    if (recarregarDepois) recarregar()
    return
  }

  if (recarregarDepois) {
    navigator.serviceWorker.addEventListener('controllerchange', recarregar, { once: true })
    setTimeout(recarregar, PRAZO_RECARGA_MS)
  }
  // `false` aqui é só pra biblioteca não tentar recarregar por conta dela;
  // ela manda o SKIP_WAITING do mesmo jeito, que é o que importa.
  await aplicar(recarregarDepois)
}

/**
 * Apaga tudo que o navegador guardou do app e recarrega do servidor.
 *
 * É a saída de emergência pra quando a atualização normal não passa. Aconteceu
 * de verdade: num aparelho o app ficou preso numa versão antiga mesmo depois
 * de fechar e abrir, e a única solução foi abrir as ferramentas do
 * desenvolvedor do navegador — algo que ninguém deveria precisar fazer.
 *
 * NÃO apaga nada seu: matérias, aulas, questões, respostas e a chave de IA
 * ficam no Supabase (ou no armazenamento do navegador, que também não é
 * tocado). O que some é só a cópia dos ARQUIVOS do app — que é justamente o
 * que está velho.
 */
export async function limparCacheDoApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registros = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registros.map((r) => r.unregister()))
    } catch {
      // Segue mesmo assim: limpar os caches abaixo já ajuda.
    }
  }

  if ('caches' in window) {
    try {
      const nomes = await caches.keys()
      await Promise.all(nomes.map((n) => caches.delete(n)))
    } catch {
      // idem
    }
  }

  // `reload()` pode ser servido pelo cache de navegação do próprio navegador.
  // Trocar a URL por uma com marca de tempo obriga uma busca nova no servidor,
  // e o `replace` evita empilhar isso no histórico do botão "voltar".
  const url = new URL(window.location.href)
  url.searchParams.set('recarregado', String(Date.now()))
  window.location.replace(url.toString())
}

export type ResultadoBusca = 'atualizado' | 'nova-versao' | 'sem-suporte' | 'erro'

// Teto pra espera da instalação. Numa rede móvel ruim o download pode demorar,
// mas deixar o usuário olhando "Procurando…" pra sempre é pior do que dizer
// que não deu e pedir pra tentar de novo.
const PRAZO_BUSCA_MS = 25_000

/**
 * Procura por versão nova AGORA, a pedido do usuário.
 *
 * Existe porque a checagem automática depende de o app estar aberto na hora
 * certa, e houve um caso real de ficar preso: o conserto do próprio mecanismo
 * de atualização estava DENTRO da versão que o cache não deixava chegar. Um
 * botão que força a busca quebra esse ciclo sem precisar mexer nas
 * ferramentas do navegador.
 *
 * `registration.update()` responde quando a BUSCA termina, não quando o
 * Service Worker novo terminou de instalar — por isso esperamos também o
 * estado dele mudar. Sem isso, a resposta seria "já está atualizado" mesmo
 * com uma versão nova baixando naquele instante.
 */
export async function procurarAtualizacao(): Promise<ResultadoBusca> {
  if (!('serviceWorker' in navigator)) return 'sem-suporte'

  const reg = registro ?? (await navigator.serviceWorker.getRegistration())
  if (!reg) return 'sem-suporte'

  // Já havia uma esperando (de uma checagem anterior ou da sessão passada).
  if (reg.waiting) return 'nova-versao'

  try {
    await reg.update()
  } catch {
    return 'erro'
  }

  const instalando = reg.installing
  if (instalando) {
    await Promise.race([
      new Promise<void>((resolve) => {
        const aoMudar = () => {
          if (instalando.state === 'installed' || instalando.state === 'activated' || instalando.state === 'redundant') {
            instalando.removeEventListener('statechange', aoMudar)
            resolve()
          }
        }
        instalando.addEventListener('statechange', aoMudar)
        aoMudar()
      }),
      new Promise<void>((resolve) => setTimeout(resolve, PRAZO_BUSCA_MS)),
    ])
  }

  return reg.waiting || atualizacaoPendente ? 'nova-versao' : 'atualizado'
}

const PRAZO_RECARGA_MS = 3000

// Intervalo entre checagens automáticas enquanto o app está aberto. Meia hora
// é curto o bastante pra pegar um deploy no mesmo dia de uso e longo o
// bastante pra não virar tráfego à toa em rede móvel.
const INTERVALO_CHECAGEM_MS = 30 * 60 * 1000

export function setupPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  aplicar = registerSW({
    immediate: true,
    onNeedRefresh() {
      atualizacaoPendente = true
      avisar()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      registro = registration

      // Uma versão nova pode ter ficado em espera desde a última sessão: nesse
      // caso o `onNeedRefresh` não dispara de novo, e sem isto o aviso nunca
      // apareceria pra quem fechou o app antes de atualizar.
      if (registration.waiting) {
        atualizacaoPendente = true
        avisar()
      }

      const checar = () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      }

      checar()
      // O app instalado na tela inicial costuma só procurar versão nova numa
      // navegação — checar ao voltar ao primeiro plano adianta isso.
      document.addEventListener('visibilitychange', checar)
      window.addEventListener('focus', checar)
      setInterval(checar, INTERVALO_CHECAGEM_MS)
    },
  })

  return aplicar
}
