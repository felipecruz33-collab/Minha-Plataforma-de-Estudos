import { registerSW } from 'virtual:pwa-register'

/**
 * Registra o Service Worker manualmente (injectRegister: false em
 * vite.config.ts) e força uma checagem por nova versão sempre que o app
 * volta ao primeiro plano — o app instalado na tela inicial normalmente só
 * verifica isso numa navegação nova, então isso adianta a checagem em vez
 * de depender só de fechar/abrir o app.
 *
 * IMPORTANTE: registrar manualmente (em vez de deixar o script
 * auto-injetado padrão do plugin) significa que SOMOS NÓS quem precisa
 * chamar updateServiceWorker(true) quando uma versão nova é encontrada —
 * sem isso, o novo Service Worker fica pronto em segundo plano mas a
 * página aberta nunca é avisada pra recarregar e buscar o JS/HTML novo.
 */
export function setupPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      // registerType: 'autoUpdate' — atualiza e recarrega sozinho, sem perguntar.
      updateServiceWorker(true)
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      registration.update()

      const checarAtualizacao = () => {
        if (document.visibilityState === 'visible') registration.update()
      }
      document.addEventListener('visibilitychange', checarAtualizacao)
      window.addEventListener('focus', checarAtualizacao)
      setInterval(checarAtualizacao, 30 * 60 * 1000)
    },
  })

  return updateServiceWorker
}
