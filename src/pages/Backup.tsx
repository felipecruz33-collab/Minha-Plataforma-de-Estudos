import { AlertTriangle, CheckCircle2, Download, Upload } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { BackupData } from '../lib/repo'

export default function Backup() {
  const { user } = useAuth()
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function exportar() {
    if (!user) return
    setBusy(true)
    try {
      const data = await repo.exportBackup(user.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-minha-plataforma-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMensagem({ tipo: 'ok', texto: 'Backup exportado com sucesso.' })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro ao exportar.' })
    } finally {
      setBusy(false)
    }
  }

  async function restaurar(file: File) {
    if (!user) return
    setBusy(true)
    setMensagem(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as BackupData
      if (data.versao !== 1 || !Array.isArray(data.materias) || !Array.isArray(data.aulas)) {
        throw new Error('Arquivo de backup em formato inválido.')
      }
      await repo.importBackup(user.id, data)
      setMensagem({ tipo: 'ok', texto: 'Backup restaurado. As matérias e aulas foram somadas à sua biblioteca.' })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível restaurar este arquivo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <Card>
        <h2 className="mb-1 font-semibold text-navy">Exportar</h2>
        <p className="mb-3 text-sm text-slate-500">Baixe um arquivo .json com todas as suas matérias, aulas, questões e respostas.</p>
        <Button onClick={exportar} disabled={busy}>
          <Download className="h-4 w-4" strokeWidth={1.75} />
          Exportar backup
        </Button>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-navy">Restaurar</h2>
        <p className="mb-3 text-sm text-slate-500">Importe um backup anterior. O conteúdo se soma ao que você já tem — nada é substituído.</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-200">
          <Upload className="h-4 w-4" strokeWidth={1.75} />
          Escolher arquivo de backup
          <input
            type="file"
            accept="application/json"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) restaurar(file)
              e.target.value = ''
            }}
          />
        </label>
      </Card>

      {mensagem && (
        <p
          className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
            mensagem.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {mensagem.tipo === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          )}
          {mensagem.texto}
        </p>
      )}
    </div>
  )
}
