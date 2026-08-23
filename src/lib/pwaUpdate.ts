import { registerSW } from 'virtual:pwa-register'

/**
 * Registra o Service Worker e força uma checagem por nova versão sempre que
 * o app volta ao primeiro plano (o app instalado na tela inicial normalmente
 * só percebe uma atualização na próxima navegação — isso adianta a checagem
 * em vez de depender só de fechar/abrir o app).
 *
 * registerType: 'autoUpdate' (vite.config.ts) já faz o Service Worker novo
 * assumir e recarregar a página sozinho assim que uma versão nova é
 * detectada — não precisa de confirmação do usuário.
 */
export function setupPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  const updateServiceWorker = registerSW({
    immediate: true,
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
