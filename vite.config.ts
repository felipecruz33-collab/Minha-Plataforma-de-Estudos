import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (e não 'autoUpdate') porque é o app que decide a hora de
      // trocar de versão: recarregar sozinho no meio de uma importação de PDF
      // ou de um simulado perderia trabalho. Ver src/lib/pwaUpdate.ts.
      registerType: 'prompt',
      // Registro manual em src/lib/pwaUpdate.ts (para checar por nova versão
      // sempre que o app volta ao primeiro plano, e pra mostrar o aviso).
      injectRegister: false,
      workbox: {
        // `skipWaiting` fica DESLIGADO de propósito. Com ele ligado, o Service
        // Worker novo nunca passa pelo estado "em espera" — e é esse estado
        // que dispara o aviso de versão nova. Era por isso que o app não
        // atualizava: a versão nova assumia por baixo, mas a página aberta
        // seguia rodando o JavaScript antigo, sem nada avisar pra recarregar.
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['icons/icon-192.svg', 'icons/icon-512.svg'],
      manifest: {
        name: 'Minha Plataforma de Estudos',
        short_name: 'Estudos',
        description: 'Plataforma pessoal de estudos para concursos públicos',
        theme_color: '#0B0F2E',
        background_color: '#0B0F2E',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
