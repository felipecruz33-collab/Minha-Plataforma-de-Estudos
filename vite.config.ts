import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Identificação da build, gravada no pacote no momento em que ele é gerado.
//
// Existe porque "o deploy saiu?" e "seu navegador está com a versão nova?" são
// perguntas diferentes, e sem isto as duas se confundiam: a única forma de
// responder era procurar na tela algum detalhe visual que só existe na versão
// nova. Agora o Perfil mostra data e commit, e a resposta é direta.
//
// VERCEL_GIT_COMMIT_SHA é preenchido pela própria Vercel durante o build.
const INFO_BUILD = {
  data: new Date().toISOString(),
  commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'local',
}

export default defineConfig({
  define: {
    __INFO_BUILD__: JSON.stringify(INFO_BUILD),
  },
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
