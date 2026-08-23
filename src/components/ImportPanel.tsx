import { AlertTriangle, CheckCircle2, FileJson, FileUp } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import { validateAulaImport } from '../lib/schema'
import { Tabs } from './ui/Tabs'

interface ImportPanelProps {
  isBiblioteca: boolean
  onImported?: () => void
}

export function ImportPanel({ isBiblioteca, onImported }: ImportPanelProps) {
  const { user } = useAuth()
  const [aba, setAba] = useState<'pdf' | 'json'>('pdf')
  const [materiaOverride, setMateriaOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [sucesso, setSucesso] = useState<string | null>(null)

  if (!user) return null

  async function importarPayload(payload: unknown, nomeArquivo: string, viaIA: boolean) {
    const result = validateAulaImport(payload)
    if (!result.valid || !result.data) {
      setErrors(result.errors)
      setSucesso(null)
      if (viaIA) {
        await repo.addGeracao({
          userId: user!.id,
          nomeArquivo,
          materia: materiaOverride || '(detecção automática)',
          aulaTitulo: '—',
          status: 'erro',
          mensagem: result.errors.slice(0, 3).join('; '),
        })
      }
      return
    }

    if (materiaOverride.trim()) result.data.materia = materiaOverride.trim()

    const aula = await repo.upsertAula(user!.id, result.data, { isBiblioteca })
    setErrors([])
    setSucesso(`Aula "${aula.titulo}" salva em "${result.data.materia}".`)
    if (viaIA) {
      await repo.addGeracao({
        userId: user!.id,
        nomeArquivo,
        materia: result.data.materia,
        aulaTitulo: aula.titulo,
        status: 'concluido',
      })
    }
    onImported?.()
  }

  async function onJsonFile(file: File) {
    setBusy(true)
    setErrors([])
    setSucesso(null)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        setErrors(['O arquivo não é um JSON válido.'])
        return
      }
      await importarPayload(parsed, file.name, false)
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Erro inesperado ao importar.'])
    } finally {
      setBusy(false)
    }
  }

  async function onPdfFile(file: File) {
    setBusy(true)
    setErrors([])
    setSucesso(null)
    try {
      const { gerarAulaViaPdfStub } = await import('../lib/ai/pdfToAula')
      const payload = await gerarAulaViaPdfStub(file, materiaOverride)
      await importarPayload(payload, file.name, true)
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Erro inesperado ao gerar a aula a partir do PDF.'])
      await repo.addGeracao({
        userId: user!.id,
        nomeArquivo: file.name,
        materia: materiaOverride || '(detecção automática)',
        aulaTitulo: '—',
        status: 'erro',
        mensagem: e instanceof Error ? e.message : 'Erro inesperado.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200">
      <Tabs
        tabs={[
          { key: 'pdf', label: 'PDF com IA' },
          { key: 'json', label: 'Arquivo .json' },
        ]}
        active={aba}
        onChange={(k) => {
          setAba(k as 'pdf' | 'json')
          setErrors([])
          setSucesso(null)
        }}
      />
      <div className="space-y-4 p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Matéria (opcional)</span>
          <input
            type="text"
            value={materiaOverride}
            onChange={(e) => setMateriaOverride(e.target.value)}
            placeholder="Deixe em branco para usar a matéria do arquivo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue"
          />
        </label>

        {aba === 'pdf' ? (
          <div>
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              PDFs longos podem demorar para processar. Nesta versão, a extração é automática mas ainda não
              identifica questões — veja detalhes em "Gerações IA" após importar.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-blue">
              <FileUp className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
              <span className="text-sm font-medium text-slate-600">Toque para escolher um PDF</span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPdfFile(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-blue">
            <FileJson className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
            <span className="text-sm font-medium text-slate-600">Toque para escolher um arquivo .json</span>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onJsonFile(file)
                e.target.value = ''
              }}
            />
          </label>
        )}

        {busy && <p className="text-sm text-slate-400">Processando…</p>}

        {sucesso && (
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {sucesso}
          </p>
        )}

        {errors.length > 0 && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
              Não foi possível importar ({errors.length} problema{errors.length > 1 ? 's' : ''}):
            </p>
            <ul className="ml-6 list-disc space-y-0.5">
              {errors.slice(0, 8).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
