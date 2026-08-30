import { AlertTriangle, CheckCircle2, Crown, FileJson, FileUp, KeyRound, Scissors } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'
import {
  JANELA_PDF_DIAS,
  LIMITE_PAGINAS_PREMIUM,
  LIMITE_PDF_GRATIS,
  inicioDaJanelaPdf,
  limitePaginas,
  situacaoPdf,
  temPremium,
} from '../lib/premium'
import { repo } from '../lib/repo'
import { validateAulaImport } from '../lib/schema'
import { MateriaPicker, resolverNomeMateria, type EscolhaMateria } from './MateriaPicker'
import { Button } from './ui/Button'
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
  const [pdfMuitoGrande, setPdfMuitoGrande] = useState<{ texto: string; numPaginas: number; nomeArquivo: string; partes: number } | null>(
    null,
  )
  // `null` enquanto carrega: sem isso, a tela piscaria "0 de 3 restantes" e
  // bloquearia o botão por um instante em toda visita.
  const [usosNaJanela, setUsosNaJanela] = useState<string[] | null>(null)

  useEffect(() => {
    if (!user) return
    let ativo = true
    repo
      .pdfsNoPeriodo(user.id, inicioDaJanelaPdf())
      .then((datas) => ativo && setUsosNaJanela(datas))
      .catch(() => ativo && setUsosNaJanela([]))
    return () => {
      ativo = false
    }
  }, [user, sucesso])

  if (!user) return null

  const cota = usosNaJanela === null ? null : situacaoPdf(perfil, usosNaJanela)
  const restantes = cota?.restantes ?? null
  const semPdfsRestantes = restantes === 0
  const paginasPermitidas = limitePaginas(perfil)

  /**
   * Ler as imagens das páginas só existe pra quem tem chave própria.
   *
   * Não é uma preferência de interface: uma página como imagem custa muitas
   * vezes o que a mesma página custa em texto, e a cota compartilhada da
   * plataforma é o recurso mais escasso daqui. Quem liga isso paga com a
   * própria chave — e o servidor recusa se ela não vier.
   */
  const temChavePropria = Boolean(perfil?.chaveGemini?.trim())
  const [lerImagens, setLerImagens] = useState(false)
  const usarImagens = lerImagens && temChavePropria
  const quandoRenova = cota?.renovaEm
    ? cota.renovaEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

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

  /** Valida e salva uma lista de aulas geradas via IA (PDF normal ou dividido em partes) — registra cada uma em "Gerações IA". */
  async function salvarPayloadsGerados(payloads: unknown[], nomeArquivo: string, nomeEscolhido: string | null | undefined) {
    setEtapa(payloads.length > 1 ? `Salvando ${payloads.length} aulas…` : 'Salvando aula…')
    const titulosSalvos: string[] = []
    const errosAcumulados: string[] = []
    let materiaFinal = ''
    for (const payload of payloads) {
      const r = await validarEImportarUma(payload, nomeEscolhido)
      if (r.ok) {
        titulosSalvos.push(r.tituloAula)
        materiaFinal = r.materiaFinal
        await repo.addGeracao({ userId: user!.id, nomeArquivo, materia: r.materiaFinal, aulaTitulo: r.tituloAula, status: 'concluido' })
      } else {
        errosAcumulados.push(...r.errors)
        await repo.addGeracao({
          userId: user!.id,
          nomeArquivo,
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
  }

  async function onJsonFile(file: File) {
    if (escolhaMateria.modo === 'nova' && !escolhaMateria.nome?.trim()) {
      setErrors(['Digite um nome para a nova matéria, ou escolha outra opção de destino.'])
      return
    }
    setBusy(true)
    setErrors([])
    setSucesso(null)
    setPdfMuitoGrande(null)
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
    if (semPdfsRestantes) {
      setErrors([
        `Você já usou os ${LIMITE_PDF_GRATIS} PDFs dos últimos ${JANELA_PDF_DIAS} dias.` +
          (quandoRenova ? ` A próxima vaga abre em ${quandoRenova}.` : '') +
          ' Assine o Premium para converter sem limite.',
      ])
      return
    }
    if (escolhaMateria.modo === 'nova' && !escolhaMateria.nome?.trim()) {
      setErrors(['Digite um nome para a nova matéria, ou escolha outra opção de destino.'])
      return
    }
    setBusy(true)
    setErrors([])
    setSucesso(null)
    setPdfMuitoGrande(null)
    const nomeEscolhido = resolverNomeMateria(escolhaMateria)
    try {
      setEtapa('Lendo o PDF…')
      const mod = await import('../lib/ai/pdfToAula')
      const { extrairTextoPdf, gerarAulaViaIA, partesRecomendadas } = mod
      const { texto, numPaginas } = await extrairTextoPdf(file)
      if (!texto) throw new Error('Não foi possível extrair texto deste PDF (pode ser um PDF escaneado sem OCR).')

      if (usarImagens) {
        if (numPaginas > mod.MAX_PAGINAS_COM_IMAGEM) {
          setErrors([
            `Com a leitura de imagens ligada, o limite é de ${mod.MAX_PAGINAS_COM_IMAGEM} páginas (este PDF tem ${numPaginas}). ` +
              'Cada página vira uma imagem, o que pesa muito mais na sua cota e demora bem mais pra preparar. ' +
              'Desligue a opção, ou divida o arquivo.',
          ])
          return
        }

        setEtapa('Preparando as imagens das páginas…')
        const paginas = await mod.extrairPaginas(file, { comImagens: true })

        setEtapa('Lendo texto e imagens com a sua chave do Gemini…')
        const payloads = await mod.gerarAulaComImagens(
          paginas,
          nomeEscolhido,
          file.name,
          perfil?.chaveGemini,
          (feitas, total) => setEtapa(`Lendo texto e imagens… parte ${feitas + 1} de ${total}`),
        )
        await salvarPayloadsGerados(payloads, file.name, nomeEscolhido)
        return
      }

      // Conferido aqui pra avisar ANTES de gastar cota e minutos de espera. O
      // servidor confere de novo por conta própria — esta checagem é
      // conveniência, não é a tranca.
      if (numPaginas > paginasPermitidas) {
        setErrors([
          `Este PDF tem ${numPaginas} páginas, e o seu plano aceita até ${paginasPermitidas}.` +
            (temPremium(perfil)
              ? ' Divida o arquivo em partes menores.'
              : ` Assine o Premium para enviar PDFs de até ${LIMITE_PAGINAS_PREMIUM} páginas, ou divida o arquivo.`),
        ])
        return
      }

      const partes = partesRecomendadas(numPaginas)
      if (partes > 1) {
        // Já dá pra saber de antemão que é grande demais — nem tenta gerar
        // de uma vez só (evitaria só bater no limite de tempo/tokens e
        // devolver um erro confuso). Oferece a divisão direto.
        setPdfMuitoGrande({ texto, numPaginas, nomeArquivo: file.name, partes })
        return
      }

      setEtapa('Gerando a aula com IA (pode levar alguns minutos)…')
      const payloads = await gerarAulaViaIA(texto, numPaginas, nomeEscolhido, file.name, perfil?.chaveGemini)
      await salvarPayloadsGerados(payloads, file.name, nomeEscolhido)
    } catch (e) {
      const { PdfMuitoGrandeError, partesRecomendadas } = await import('../lib/ai/pdfToAula')
      const mensagem = e instanceof Error ? e.message : 'Erro inesperado ao gerar a aula a partir do PDF.'
      setErrors([mensagem])
      if (e instanceof PdfMuitoGrandeError) {
        // Mesmo um PDF "dentro do esperado" às vezes falha na prática — se
        // isso acontecer, sempre oferece pelo menos 2 partes.
        const partes = Math.max(2, partesRecomendadas(e.numPaginas))
        setPdfMuitoGrande({ texto: e.textoCompleto, numPaginas: e.numPaginas, nomeArquivo: file.name, partes })
      }
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

  async function onDividirPdf() {
    if (!pdfMuitoGrande) return
    setBusy(true)
    setErrors([])
    setSucesso(null)
    const alvo = pdfMuitoGrande
    setPdfMuitoGrande(null)
    const nomeEscolhido = resolverNomeMateria(escolhaMateria)
    try {
      const { gerarAulaViaIADividida } = await import('../lib/ai/pdfToAula')
      const payloads = await gerarAulaViaIADividida(
        alvo.texto,
        alvo.numPaginas,
        alvo.partes,
        nomeEscolhido ?? undefined,
        alvo.nomeArquivo,
        perfil?.chaveGemini,
        (concluidas, total) =>
          setEtapa(
            concluidas === 0
              ? `Montando a aula: processando ${total} trechos em paralelo…`
              : `Montando a aula: ${concluidas} de ${total} trechos prontos…`,
          ),
      )
      await salvarPayloadsGerados(payloads, alvo.nomeArquivo, nomeEscolhido)
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Erro inesperado ao gerar a aula a partir do PDF dividido.'
      setErrors([mensagem])
      await repo.addGeracao({
        userId: user!.id,
        nomeArquivo: alvo.nomeArquivo,
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
          setPdfMuitoGrande(null)
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
              <span>
                A IA lê o PDF e monta a teoria e as questões automaticamente, de forma <span className="font-semibold">objetiva</span>:
                cobre os pontos principais e preserva todas as questões, com um comentário curto no gabarito. PDFs longos são
                processados em etapas e podem levar alguns minutos. Confira o resultado antes de confiar 100%, e veja detalhes em
                "Gerações IA" após importar.
              </span>
            </p>
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <FileJson className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>
                Quer material mais aprofundado — teoria expandida e comentário em <span className="font-semibold">cada</span>{' '}
                alternativa? Monte o conteúdo como arquivo <span className="font-semibold">.json</span> e use a outra aba. O formato
                aceita tudo isso; aqui no PDF a IA é mantida enxuta de propósito, pra conseguir entregar sem estourar o tempo do
                servidor.
              </span>
            </p>
            {!perfil?.chaveGemini && (
              <p className="mb-2 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                <KeyRound className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {/* O texto precisa ficar num único filho: o container é flex, então
                    cada trecho solto (e o link) viraria um item separado e o
                    parágrafo quebraria em colunas estreitas. */}
                <span>
                  Isso usa uma chave de IA compartilhada, que pode ficar sobrecarregada em horários de pico.{' '}
                  <Link to="/perfil" className="font-semibold underline">
                    Adicione sua própria chave gratuita em Perfil
                  </Link>{' '}
                  pra ter sua própria cota, sem fila com outros usuários.
                </span>
              </p>
            )}
            {/* Aviso de cota: só aparece pra quem tem limite (Premium e admin
                recebem `null` de `pdfsRestantes`) e só depois da contagem
                chegar, pra não piscar um número errado. */}
            {restantes !== null && (
              <div
                className={`mb-3 flex items-start gap-2 rounded-lg p-3 text-xs ${
                  semPdfsRestantes ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'
                }`}
              >
                <Crown className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>
                  {semPdfsRestantes ? (
                    <>
                      Você já usou os <strong>{LIMITE_PDF_GRATIS} PDFs</strong> dos últimos {JANELA_PDF_DIAS} dias.
                      {quandoRenova && (
                        <>
                          {' '}
                          A próxima vaga abre em <strong>{quandoRenova}</strong>.
                        </>
                      )}{' '}
                      <Link to="/premium" className="font-semibold underline">
                        Assine o Premium
                      </Link>{' '}
                      para converter sem limite — a importação de arquivos <strong>.json</strong> continua livre na outra
                      aba.
                    </>
                  ) : (
                    <>
                      Plano gratuito: resta{restantes === 1 ? '' : 'm'} <strong>{restantes}</strong> de {LIMITE_PDF_GRATIS}{' '}
                      PDF{restantes === 1 ? '' : 's'} com IA a cada {JANELA_PDF_DIAS} dias.{' '}
                      <Link to="/premium" className="font-semibold underline">
                        O Premium é sem limite
                      </Link>
                      ; a importação de <strong>.json</strong> já é livre pra todo mundo.
                    </>
                  )}
                </span>
              </div>
            )}
            <label
              className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center ${
                semPdfsRestantes
                  ? 'cursor-not-allowed border-slate-200 opacity-60'
                  : 'cursor-pointer border-slate-300 hover:border-brand-blue'
              }`}
            >
              <FileUp className="h-8 w-8 text-slate-400" strokeWidth={1.5} />
              <span className="text-sm font-medium text-slate-600">
                {semPdfsRestantes ? 'Limite do plano gratuito atingido' : 'Toque para escolher um PDF'}
              </span>
              {/* O tamanho aparece aqui, e não junto do aviso de cota, porque
                  quem é Premium não vê aquele aviso (não tem limite de
                  quantidade) e mesmo assim precisa saber deste. Fica curto de
                  propósito: é uma informação, não um alerta. */}
              <span className="text-xs text-slate-400">
                Até {paginasPermitidas} páginas
                {temPremium(perfil) ? ' · plano Premium' : ` no plano gratuito · ${LIMITE_PAGINAS_PREMIUM} no Premium`}
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={busy || semPdfsRestantes}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPdfFile(file)
                  e.target.value = ''
                }}
              />
            </label>

            {/* Só aparece pra quem tem chave própria: sem ela o servidor
                recusa, e uma opção que sempre falha é pior que opção nenhuma. */}
            {temChavePropria && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={lerImagens}
                  onChange={(e) => setLerImagens(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue"
                />
                <span className="text-xs text-slate-500">
                  <strong className="text-slate-700">Ler também as imagens das páginas</strong> — a IA enxerga
                  fórmulas, gráficos e tabelas em vez de só o texto solto. Útil em exatas.
                  <br />
                  Usa <strong>só a sua chave do Gemini</strong>, sem os provedores de reserva: se ela falhar, a
                  importação falha. Gasta bem mais da sua cota, demora mais, e o limite cai para 40 páginas.
                </span>
              </label>
            )}
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

        {pdfMuitoGrande && !busy && (
          <div className="flex flex-col items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p>
              Esse PDF é grande demais para a IA gerar de uma vez. Posso quebrá-lo em {pdfMuitoGrande.partes} trechos, processar
              vários ao mesmo tempo e juntar tudo em <span className="font-semibold">uma única aula</span> no final.
            </p>
            <Button type="button" variant="secondary" onClick={onDividirPdf} className="!py-1.5 !text-sm">
              <Scissors className="h-4 w-4" strokeWidth={1.75} />
              Processar {pdfMuitoGrande.partes} trechos e montar a aula
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
