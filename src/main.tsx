import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { setupPwaUpdates } from './lib/pwaUpdate'

setupPwaUpdates()

// Um deploy novo troca os hashes dos arquivos JS. Se a aba já estava aberta
// de antes, um import() dinâmico (ex.: a aba "PDF com IA") pode tentar buscar
// um arquivo que não existe mais no servidor — isso recarrega a página pra
// pegar a versão atual em vez de mostrar "Failed to fetch dynamically
// imported module".
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
