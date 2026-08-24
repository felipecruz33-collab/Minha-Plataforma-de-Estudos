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
export async function aplicarAtualizacao(): Promise<void> {
  if (!aplicar || !('serviceWorker' in navigator)) {
    // Sem Service Worker (navegador sem suporte, ou aba servida em http),
    // recarregar já basta pra buscar os arquivos novos.
    recarregar()
    return
  }

  navigator.serviceWorker.addEventListener('controllerchange', recarregar, { once: true })
  setTimeout(recarregar, PRAZO_RECARGA_MS)
  await aplicar(true)
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
