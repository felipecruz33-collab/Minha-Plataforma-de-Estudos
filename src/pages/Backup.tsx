import { AlertTriangle, CheckCircle2, Download, Library, Upload } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { BackupData } from '../lib/repo'

const hoje = () => new Date().toISOString().slice(0, 10)

function baixarJson(data: unknown, nome: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function lerBackup(texto: string): BackupData {
  const data = JSON.parse(texto) as BackupData
  if (data.versao !== 1 || !Array.isArray(data.materias) || !Array.isArray(data.aulas)) {
    throw new Error('Arquivo de backup em formato inválido.')
  }
  return data
}

/** Backups antigos não têm o campo — e todos eles eram pessoais. */
function escopoDe(data: BackupData): 'pessoal' | 'biblioteca' {
  return data.escopo === 'biblioteca' ? 'biblioteca' : 'pessoal'
}

export default function Backup() {
  const { user, perfil } = useAuth()
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [aRestaurarNaBiblioteca, setARestaurarNaBiblioteca] = useState<BackupData | null>(null)

  async function exportar() {
    if (!user) return
    setBusy(true)
    try {
      const data = await repo.exportBackup(user.id)
      baixarJson(data, `backup-minha-plataforma-${hoje()}.json`)
      setMensagem({ tipo: 'ok', texto: 'Backup exportado com sucesso.' })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro ao exportar.' })
    } finally {
      setBusy(false)
    }
  }

  async function exportarBiblioteca() {
    setBusy(true)
    setMensagem(null)
    try {
      const data = await repo.exportBiblioteca()
      if (data.aulas.length === 0) {
        setMensagem({ tipo: 'erro', texto: 'A biblioteca está vazia — não há nada para copiar.' })
        return
      }
      baixarJson(data, `biblioteca-minha-plataforma-${hoje()}.json`)
      setMensagem({
        tipo: 'ok',
        texto: `Cópia da biblioteca baixada: ${data.materias.length} matérias e ${data.aulas.length} aulas.`,
      })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro ao copiar a biblioteca.' })
    } finally {
      setBusy(false)
    }
  }

  async function escolherArquivoDaBiblioteca(file: File) {
    setMensagem(null)
    try {
      const data = lerBackup(await file.text())
      if (escopoDe(data) !== 'biblioteca') {
        throw new Error(
          'Este arquivo é um backup pessoal, não da biblioteca. Restaurá-lo aqui publicaria o conteúdo de estudo de alguém para todos os assinantes.',
        )
      }
      // Confirma antes de gravar: isto escreve na biblioteca de todo mundo.
      setARestaurarNaBiblioteca(data)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível ler este arquivo.' })
    }
  }

  async function restaurarBiblioteca() {
    const data = aRestaurarNaBiblioteca
    setARestaurarNaBiblioteca(null)
    if (!data || !user) return
    setBusy(true)
    try {
      await repo.importBackup(user.id, data, { paraBiblioteca: true })
      setMensagem({ tipo: 'ok', texto: `Biblioteca restaurada: ${data.aulas.length} aulas.` })
    } catch (e) {
      setMensagem({
        tipo: 'erro',
        texto: e instanceof Error ? e.message : 'Não foi possível restaurar a biblioteca.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function restaurar(file: File) {
    if (!user) return
    setBusy(true)
    setMensagem(null)
    try {
      const data = lerBackup(await file.text())
      if (escopoDe(data) === 'biblioteca') {
        throw new Error(
          'Este arquivo é uma cópia da biblioteca compartilhada. Restaurá-lo aqui enterraria a biblioteca inteira dentro da sua conta — use o cartão da biblioteca, mais abaixo.',
        )
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

      {/* Só o administrador vê — e quem barra de verdade é a RLS do banco, que
          recusa escrita na biblioteca vinda de qualquer outra conta. */}
      {perfil?.isAdmin && (
        <Card className="border-brand-blue/30 bg-brand-blue/[0.03]">
          <div className="mb-1 flex items-center gap-2">
            <Library className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
            <h2 className="font-semibold text-navy">Biblioteca compartilhada</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            O conteúdo curado da plataforma não entra no backup pessoal — as matérias da biblioteca não pertencem a
            nenhuma conta. Fora daqui ele existe em um lugar só: o banco de dados. Baixe uma cópia de vez em quando.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportarBiblioteca} disabled={busy}>
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Baixar cópia da biblioteca
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-200">
              <Upload className="h-4 w-4" strokeWidth={1.75} />
              Restaurar biblioteca
              <input
                type="file"
                accept="application/json"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) escolherArquivoDaBiblioteca(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </Card>
      )}

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
      <ConfirmDialog
        open={aRestaurarNaBiblioteca !== null}
        title="Restaurar a biblioteca compartilhada?"
        description={
          aRestaurarNaBiblioteca
            ? `Vai gravar ${aRestaurarNaBiblioteca.materias.length} matérias e ${aRestaurarNaBiblioteca.aulas.length} aulas na biblioteca que TODOS os assinantes veem. Aulas com o mesmo título dentro da mesma matéria são substituídas pelo conteúdo do arquivo; o resto continua onde está.`
            : ''
        }
        confirmLabel="Restaurar biblioteca"
        confirmVariant="primary"
        onConfirm={restaurarBiblioteca}
        onCancel={() => setARestaurarNaBiblioteca(null)}
      />
    </div>
  )
}
