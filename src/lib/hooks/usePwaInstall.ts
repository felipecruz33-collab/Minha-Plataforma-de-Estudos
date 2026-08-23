import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari não tem display-mode: standalone confiável — usa a flag própria dela.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Expõe o prompt nativo de instalação do PWA (Chrome/Edge/Android) para uso
 * num botão próprio. No iOS Safari esse evento não existe — o navegador não
 * permite instalar via clique, só pelo menu "Compartilhar" — então ali só
 * indicamos `ios: true` para mostrar instruções em vez de um botão.
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }

  return {
    canInstall: !installed && !!prompt,
    /** iOS não dispara beforeinstallprompt — mostrar instruções manuais em vez de botão. */
    showIOSInstructions: !installed && isIOS() && !prompt,
    installed,
    install,
  }
}
