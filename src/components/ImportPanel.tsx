import { AlertTriangle, CheckCircle2, FileJson, FileUp, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import { validateAulaImport } from '../lib/schema'
import { MateriaPicker, resolverNomeMateria, type EscolhaMateria } from './MateriaPicker'
import { Tabs } from './ui/Tabs'

interface ImportPanelProps {
  isBiblioteca: boolean
  onImported?: () => void
}

export function ImportPanel({ isBiblioteca, onImported }: ImportPanelProps) {
  const { user, perfil } = useAuth()
  const [aba, setAba] = useState<'pdf' | 'json'>('pdf')
  const [escolhaMateria, setEscolhaMateria] = useState<EscolhaMateria>({ modo: 'auto' })
  const [busy, setBusy] = useState(false)
  const [etapa, setEtapa] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [sucesso, setSucesso] = useState<string | null>(null)

  if (!user) return null

  /** Valida e salva uma única aula — usado tanto pelo .json manual quanto, em loop, pelo PDF (que pode gerar mais de uma). */
  async function validarEImportarUma(
    payload: unknown,
    nomeEscolhido: string | null | undefined,
  ): Promise<{ ok: true; tituloAula: string; materiaFinal: string } | { ok: false; errors: string[] }> {
    const result = validateAulaImport(payload)
    if (!result.valid || !result.data) return { ok: false, errors: result.errors }
    if (nomeEscolhido) result.data.materia = nomeEscolhido
    const aula = await repo.upsertAula(user!.id, result.data, { isBiblioteca })
    return { ok: true, tituloAula: aula.titulo, materiaFinal: result.data.materia }
  }

  async function importarPayload(payload: unknown, nomeArquivo: string, viaIA: boolean) {
    const nomeEscolhido = resolverNomeMateria(escolhaMateria)
    const r = await validarEImportarUma(payload, nomeEscolhido)

    if (!r.ok) {
      setErrors(r.errors)
      setSucesso(null)
      if (viaIA) {
        await repo.addGeracao({
          userId: user!.id,
          nomeArquivo,
          materia: nomeEscolhido || '(detecção automática)',
          aulaTitulo: '—',
          status: 'erro',
          mensagem: r.errors.slice(0, 3).join('; '),
        })
      }
      return
    }

    setErrors([])
    setSucesso(`Aula "${r.tituloAula}" salva em "${r.materiaFinal}".`)
    if (viaIA) {
      await repo.addGeracao({
        userId: user!.id,
        nomeArquivo,
        materia: r.materiaFinal,
        aulaTitulo: r.tituloAula,
        status: 'concluido',
      })
    }
    onImported?.()
  }

  async function onJsonFile(file: File) {
    if (escolhaMateria.modo === 'nova' && !escolhaMateria.nome?.trim()) {
      setErrors(['Digite um nome para a nova matéria, ou escolha outra opção de destino.'])
      return
    }
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
    if (escolhaMateria.modo === 'nova' && !escolhaMateria.nome?.trim()) {
      setErrors(['Digite um nome para a nova matéria, ou escolha outra opção de destino.'])
      return
    }
    setBusy(true)
    setErrors([])
    setSucesso(null)
    const nomeEscolhido = resolverNomeMateria(escolhaMateria)
    try {
      setEtapa('Lendo o PDF…')
      const { gerarAulaViaIA } = await import('../lib/ai/pdfToAula')
      setEtapa('Gerando a aula com IA (pode levar até 1 minuto)…')
      const payloads = await gerarAulaViaIA(file, nomeEscolhido, perfil?.chaveGemini)

      setEtapa(payloads.length > 1 ? `Salvando ${payloads.length} aulas…` : 'Salvando aula…')
      const titulosSalvos: string[] = []
      const errosAcumulados: string[] = []
      let materiaFinal = ''
      for (const payload of payloads) {
        const r = await validarEImportarUma(payload, nomeEscolhido)
        if (r.ok) {
          titulosSalvos.push(r.tituloAula)
          materiaFinal = r.materiaFinal
          await repo.addGeracao({ userId: user!.id, nomeArquivo: file.name, materia: r.materiaFinal, aulaTitulo: r.tituloAula, status: 'concluido' })
        } else {
          errosAcumulados.push(...r.errors)
          await repo.addGeracao({
            userId: user!.id,
            nomeArquivo: file.name,
            materia: nomeEscolhido || '(detecção automática)',
            aulaTitulo: '—',
            status: 'erro',
            mensagem: r.errors.slice(0, 3).join('; '),
          })
        }
      }

      setErrors(errosAcumulados)
      if (titulosSalvos.length > 0) {
        setSucesso(
          titulosSalvos.length === 1
            ? `Aula "${titulosSalvos[0]}" salva em "${materiaFinal}".`
            : `${titulosSalvos.length} aulas salvas em "${materiaFinal}": ${titulosSalvos.join(', ')}.`,
        )
        onImported?.()
      }
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Erro inesperado ao gerar a aula a partir do PDF.'
      setErrors([mensagem])
      await repo.addGeracao({
        userId: user!.id,
        nomeArquivo: file.name,
        materia: nomeEscolhido || '(detecção automática)',
        aulaTitulo: '—',
        status: 'erro',
        mensagem,
      })
    } finally {
      setBusy(false)
      setEtapa(null)
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
        <MateriaPicker
          isBiblioteca={isBiblioteca}
          autoLabel={aba === 'pdf' ? 'Deixar a IA identificar automaticamente' : 'Usar a matéria do próprio arquivo .json'}
          value={escolhaMateria}
          onChange={setEscolhaMateria}
        />

        {aba === 'pdf' ? (
          <div>
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              PDFs longos podem demorar mais de um minuto para processar. A IA lê o PDF inteiro e monta a teoria
              e as questões automaticamente — se o PDF tiver mais de uma aula, cada uma é criada separadamente.
              Confira o resultado antes de confiar 100%, e veja detalhes em "Gerações IA" após importar.
            </p>
            {!perfil?.chaveGemini && (
              <p className="mb-2 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                <KeyRound className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                Isso usa uma chave de IA compartilhada, que pode ficar sobrecarregada em horários de pico.{' '}
                <Link to="/perfil" className="font-semibold underline">
                  Adicione sua própria chave gratuita em Perfil
                </Link>{' '}
                pra ter sua própria cota, sem fila com outros usuários.
              </p>
            )}
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

        {busy && <p className="text-sm text-slate-400">{etapa ?? 'Processando…'}</p>}

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
