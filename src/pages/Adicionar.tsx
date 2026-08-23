import { ImportPanel } from '../components/ImportPanel'

export default function Adicionar() {
  return (
    <div>
      <p className="mb-5 text-sm text-slate-500">
        Importe teoria e questões para sua biblioteca pessoal. O conteúdo se soma ao que você já tem — nada é
        sobrescrito. Você pode excluir qualquer aula depois em "Início".
      </p>
      <ImportPanel isBiblioteca={false} />
    </div>
  )
}
