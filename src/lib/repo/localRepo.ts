import { ordenarAulas } from '../ordenarAulas'
import { primeiraDataPorArquivo } from './primeiraDataPorArquivo'
import type { Aula, AulaImportPayload, Bloco, Cronograma, EstadoDoCicloRevisao, GeracaoIA, Materia, Perfil, Questao, Resposta, Simulado, UsoIA } from '../types'
import type { AulaBasica, AulaComQuestoes, BackupData, DataRepository, MateriaComContagem, RespostaParaGravar } from './types'

const STORAGE_KEY = 'mpe:v1'

/** Usado quando VITE_ADMIN_EMAIL não está configurada (ex.: deploy sem variáveis de ambiente). */
const DEFAULT_ADMIN_EMAIL = 'felipe.cruz33@gmail.com'

interface Store {
  materias: Materia[]
  aulas: Aula[]
  respostas: Resposta[]
  perfis: Record<string, Perfil>
  geracoes: GeracaoIA[]
  simulados: Simulado[]
  cronogramas: Record<string, Cronograma>
  /**
   * Medidor de IA. No modo local ninguém escreve aqui: sem Supabase o
   * servidor não registra uso, porque não há cota compartilhada nem conta
   * paga pra proteger. O campo existe pra que o formato seja o mesmo dos dois
   * lados — e pra dar como semear um cenário nos testes.
   */
  usoIa: (UsoIA & { userId: string })[]
}

function emptyStore(): Store {
  return { materias: [], aulas: [], respostas: [], perfis: {}, geracoes: [], simulados: [], cronogramas: {}, usoIa: [] }
}

function load(): Store {
  if (typeof localStorage === 'undefined') return emptyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    return { ...emptyStore(), ...JSON.parse(raw) }
  } catch {
    return emptyStore()
  }
}

/**
 * Blocos na ordem do campo `ordem`, e não na ordem em que foram gravados.
 *
 * O repositório Supabase sempre ordenou (o banco fazia isso na consulta), mas
 * aqui a aula voltava exatamente como tinha sido salva. Um JSON importado com
 * os blocos fora de ordem — coisa que o schema permite, já que `ordem` é um
 * campo à parte — aparecia embaralhado só neste repositório.
 */
function comBlocosEmOrdem(aula: Aula): Aula {
  return { ...aula, blocos: [...aula.blocos].sort((a, b) => a.ordem - b.ordem) }
}

function save(store: Store) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function id() {
  return crypto.randomUUID()
}

function toContagem(materias: Materia[], aulas: Aula[]): MateriaComContagem[] {
  return materias.map((m) => ({ ...m, numAulas: aulas.filter((a) => a.materiaId === m.id).length }))
}

export class LocalRepository implements DataRepository {
  async listMaterias(userId: string): Promise<MateriaComContagem[]> {
    const s = load()
    return toContagem(
      s.materias.filter((m) => !m.isBiblioteca && m.userId === userId),
      s.aulas,
    )
  }

  async listBiblioteca(): Promise<MateriaComContagem[]> {
    const s = load()
    return toContagem(
      s.materias.filter((m) => m.isBiblioteca),
      s.aulas,
    )
  }

  async getMateria(materiaId: string): Promise<Materia | null> {
    const s = load()
    return s.materias.find((m) => m.id === materiaId) ?? null
  }

  async createMateriaVazia(userId: string, nome: string, isBiblioteca: boolean): Promise<Materia> {
    const s = load()
    const materia: Materia = {
      id: id(),
      userId: isBiblioteca ? null : userId,
      nome,
      isBiblioteca,
      criadoEm: new Date().toISOString(),
    }
    s.materias.push(materia)
    save(s)
    return materia
  }

  async deleteMateria(materiaId: string): Promise<void> {
    const s = load()
    s.materias = s.materias.filter((m) => m.id !== materiaId)
    const aulaIds = new Set(s.aulas.filter((a) => a.materiaId === materiaId).map((a) => a.id))
    s.aulas = s.aulas.filter((a) => a.materiaId !== materiaId)
    s.respostas = s.respostas.filter((r) => !aulaIds.has(r.aulaId))
    save(s)
  }

  async listAulas(materiaId: string): Promise<Aula[]> {
    const s = load()
    return ordenarAulas(s.aulas.filter((a) => a.materiaId === materiaId)).map(comBlocosEmOrdem)
  }

  async getAula(aulaId: string): Promise<Aula | null> {
    const s = load()
    const aula = s.aulas.find((a) => a.id === aulaId)
    return aula ? comBlocosEmOrdem(aula) : null
  }

  async listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]> {
    const s = load()
    const materiaIds = new Set(
      s.materias.filter((m) => (m.userId === userId && !m.isBiblioteca) || (includeBiblioteca && m.isBiblioteca)).map((m) => m.id),
    )
    return s.aulas.filter((a) => materiaIds.has(a.materiaId))
  }

  async upsertAula(
    userId: string,
    payload: AulaImportPayload,
    opts: { isBiblioteca: boolean; daBiblioteca?: boolean },
  ): Promise<Aula> {
    const s = load()

    let materia = s.materias.find(
      (m) => m.nome === payload.materia && m.isBiblioteca === opts.isBiblioteca && (opts.isBiblioteca || m.userId === userId),
    )
    if (!materia) {
      materia = {
        id: id(),
        userId: opts.isBiblioteca ? null : userId,
        nome: payload.materia,
        isBiblioteca: opts.isBiblioteca,
        criadoEm: new Date().toISOString(),
      }
      s.materias.push(materia)
    }

    const existente = s.aulas.find((a) => a.materiaId === materia!.id && a.titulo === payload.aula.titulo)
    const aulaId = existente?.id ?? id()
    const now = new Date().toISOString()

    const blocos: Bloco[] = payload.aula.blocos
      .map((b) => ({ tipo: b.tipo as Bloco['tipo'], ordem: b.ordem, html: b.html }))
      .sort((a, b) => a.ordem - b.ordem)

    const questoes: Questao[] = payload.aula.questoes.map((q, i) => ({
      id: `${aulaId}:q${i}`,
      aulaId,
      materiaId: materia!.id,
      tema: q.tema,
      banca: q.banca,
      ano: q.ano,
      orgao: q.orgao,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      gabarito: q.gabarito,
      explicacao: q.explicacao,
      altExp: q.altExp,
    }))

    const aula: Aula = {
      id: aulaId,
      materiaId: materia.id,
      titulo: payload.aula.titulo,
      blocos,
      questoes,
      // Aula reimportada mantém a posição que já tinha; aula nova entra sem
      // ordem definida, e `ordenarAulas` a coloca no fim da lista.
      ordem: existente?.ordem ?? null,
      // Só liga, nunca desliga — espelha o gatilho do banco (migração 0016).
      daBiblioteca: !!opts.daBiblioteca || !!existente?.daBiblioteca,
      criadoEm: existente?.criadoEm ?? now,
      atualizadoEm: now,
    }

    s.aulas = existente ? s.aulas.map((a) => (a.id === aulaId ? aula : a)) : [...s.aulas, aula]
    save(s)
    return aula
  }

  async deleteAula(aulaId: string): Promise<void> {
    const s = load()
    s.aulas = s.aulas.filter((a) => a.id !== aulaId)
    s.respostas = s.respostas.filter((r) => r.aulaId !== aulaId)
    save(s)
  }

  async renomearAula(aulaId: string, titulo: string): Promise<Aula> {
    const s = load()
    const aula = s.aulas.find((a) => a.id === aulaId)
    if (!aula) throw new Error('Aula não encontrada')
    aula.titulo = titulo
    aula.atualizadoEm = new Date().toISOString()
    save(s)
    return aula
  }

  async renomearMateria(materiaId: string, nome: string): Promise<Materia> {
    const s = load()
    const materia = s.materias.find((m) => m.id === materiaId)
    if (!materia) throw new Error('Matéria não encontrada')
    materia.nome = nome
    save(s)
    return materia
  }

  async reordenarAulas(materiaId: string, aulaIdsEmOrdem: string[]): Promise<void> {
    const s = load()
    const posicao = new Map(aulaIdsEmOrdem.map((id, i) => [id, i]))
    for (const aula of s.aulas) {
      if (aula.materiaId !== materiaId) continue
      const p = posicao.get(aula.id)
      if (p !== undefined) aula.ordem = p
    }
    save(s)
  }

  async listAulasComQuestoes(materiaIds: string[]): Promise<AulaComQuestoes[]> {
    const s = load()
    return materiaIds.flatMap((materiaId) =>
      ordenarAulas(s.aulas.filter((a) => a.materiaId === materiaId)).map((a) => ({
        id: a.id,
        materiaId: a.materiaId,
        titulo: a.titulo,
        ordem: a.ordem,
        criadoEm: a.criadoEm,
        questoes: a.questoes,
      })),
    )
  }

  async excluirQuestao(questaoId: string): Promise<void> {
    const s = load()
    for (const aula of s.aulas) {
      const antes = aula.questoes.length
      aula.questoes = aula.questoes.filter((q) => q.id !== questaoId)
      if (aula.questoes.length !== antes) aula.atualizadoEm = new Date().toISOString()
    }
    // No Supabase isto é uma cascata do próprio banco; aqui precisa ser feito
    // à mão, senão sobrariam respostas apontando para uma questão que não
    // existe mais e o Desempenho contaria acertos de nada.
    s.respostas = s.respostas.filter((r) => r.questaoId !== questaoId)
    save(s)
  }

  async listRespostas(userId: string): Promise<Resposta[]> {
    const s = load()
    return s.respostas.filter((r) => r.userId === userId)
  }

  async registrarResposta(resposta: RespostaParaGravar): Promise<Resposta> {
    const [gravada] = await this.registrarRespostas([resposta])
    return gravada
  }

  async registrarRespostas(respostas: RespostaParaGravar[]): Promise<Resposta[]> {
    if (respostas.length === 0) return []
    const s = load()
    const novas: Resposta[] = respostas.map((r) => ({
      ...r,
      id: id(),
      respondidoEm: r.respondidoEm ?? new Date().toISOString(),
    }))
    s.respostas.push(...novas)
    save(s)
    return novas
  }

  async esquecerRespostas(
    userId: string,
    escopo: { materiaId?: string; aulaId?: string; questaoIds?: string[] },
  ): Promise<void> {
    if (escopo.questaoIds && escopo.questaoIds.length === 0) return
    const escolhidas = escopo.questaoIds ? new Set(escopo.questaoIds) : null
    const s = load()
    s.respostas = s.respostas.filter((r) => {
      if (r.userId !== userId) return true
      if (escolhidas) return !escolhidas.has(r.questaoId)
      if (escopo.aulaId) return r.aulaId !== escopo.aulaId
      if (escopo.materiaId) return r.materiaId !== escopo.materiaId
      return false
    })
    save(s)
  }

  /** Perfil gravado antes do ciclo de revisão existir não tem o campo — completa. */
  private static comCiclo(p: Perfil): Perfil {
    return p.revisao ? p : { ...p, revisao: { pausadaEm: null, retomadaEm: null, reinicio: null } }
  }

  async getPerfil(userId: string, email: string): Promise<Perfil> {
    const s = load()
    const adminEmail = ((import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? DEFAULT_ADMIN_EMAIL).toLowerCase()
    const deveSerAdmin = email.toLowerCase() === adminEmail

    if (!s.perfis[userId]) {
      s.perfis[userId] = {
        userId, email, nome: '', isAdmin: deveSerAdmin, isPremium: false, favoritos: [], chaveGemini: null,
        revisao: { pausadaEm: null, retomadaEm: null, reinicio: null },
      }
      save(s)
    } else if (deveSerAdmin && !s.perfis[userId].isAdmin) {
      // Corrige perfis criados antes de VITE_ADMIN_EMAIL estar configurada corretamente.
      s.perfis[userId].isAdmin = true
      save(s)
    }
    return LocalRepository.comCiclo(s.perfis[userId])
  }

  async atualizarNome(userId: string, nome: string): Promise<Perfil> {
    const s = load()
    if (!s.perfis[userId]) throw new Error('Perfil não encontrado')
    s.perfis[userId].nome = nome
    save(s)
    return s.perfis[userId]
  }

  async salvarChaveGemini(userId: string, chave: string | null): Promise<Perfil> {
    const s = load()
    if (!s.perfis[userId]) throw new Error('Perfil não encontrado')
    s.perfis[userId].chaveGemini = chave
    save(s)
    return s.perfis[userId]
  }

  async listPerfis(): Promise<Perfil[]> {
    const s = load()
    return Object.values(s.perfis)
  }

  async setPremium(userId: string, value: boolean): Promise<void> {
    const s = load()
    if (s.perfis[userId]) {
      s.perfis[userId].isPremium = value
      save(s)
    }
  }

  async excluirUsuario(userId: string): Promise<void> {
    const s = load()
    const materiaIds = new Set(s.materias.filter((m) => m.userId === userId).map((m) => m.id))
    const aulaIds = new Set(s.aulas.filter((a) => materiaIds.has(a.materiaId)).map((a) => a.id))
    s.materias = s.materias.filter((m) => !materiaIds.has(m.id))
    s.aulas = s.aulas.filter((a) => !aulaIds.has(a.id))
    s.respostas = s.respostas.filter((r) => r.userId !== userId)
    s.geracoes = s.geracoes.filter((g) => g.userId !== userId)
    s.usoIa = (s.usoIa ?? []).filter((u) => u.userId !== userId)
    s.simulados = s.simulados.filter((x) => x.userId !== userId)
    delete s.cronogramas[userId]  // cronograma é um por usuário, guardado por id
    delete s.perfis[userId]
    save(s)
  }

  async pdfsNoPeriodo(userId: string, desdeISO: string): Promise<string[]> {
    const s = load()
    return primeiraDataPorArquivo(
      s.geracoes.filter((g) => g.userId === userId && g.criadoEm >= desdeISO).map((g) => ({ nome: g.nomeArquivo, data: g.criadoEm })),
    )
  }

  async listAulasBasicas(materiaIds: string[]): Promise<AulaBasica[]> {
    const s = load()
    const pedidas = new Set(materiaIds)
    const porMateria = new Map<string, AulaBasica[]>()
    for (const a of s.aulas) {
      if (!pedidas.has(a.materiaId)) continue
      const basica: AulaBasica = { id: a.id, materiaId: a.materiaId, titulo: a.titulo, ordem: a.ordem, criadoEm: a.criadoEm }
      const lista = porMateria.get(a.materiaId)
      if (lista) lista.push(basica)
      else porMateria.set(a.materiaId, [basica])
    }
    return materiaIds.flatMap((id) => ordenarAulas(porMateria.get(id) ?? []))
  }

  async salvarCicloRevisao(userId: string, ciclo: EstadoDoCicloRevisao): Promise<Perfil> {
    const s = load()
    if (!s.perfis[userId]) throw new Error('Perfil não encontrado')
    s.perfis[userId] = { ...LocalRepository.comCiclo(s.perfis[userId]), revisao: ciclo }
    save(s)
    return s.perfis[userId]
  }

  async usoNoPeriodo(userId: string, desdeISO: string): Promise<UsoIA[]> {
    const s = load()
    return (s.usoIa ?? [])
      .filter((u) => u.userId === userId && u.criadoEm >= desdeISO)
      .map(({ arquivo, caracteres, criadoEm }) => ({ arquivo, caracteres, criadoEm }))
  }

  async toggleFavorito(userId: string, questaoId: string): Promise<Perfil> {
    const s = load()
    const perfil = s.perfis[userId]
    if (!perfil) throw new Error('Perfil não encontrado')
    perfil.favoritos = perfil.favoritos.includes(questaoId)
      ? perfil.favoritos.filter((f) => f !== questaoId)
      : [...perfil.favoritos, questaoId]
    save(s)
    return perfil
  }

  async exportBackup(userId: string): Promise<BackupData> {
    const s = load()
    const materias = s.materias.filter((m) => m.userId === userId && !m.isBiblioteca)
    const materiaIds = new Set(materias.map((m) => m.id))
    const aulas = s.aulas.filter((a) => materiaIds.has(a.materiaId))
    const respostas = s.respostas.filter((r) => r.userId === userId)
    const perfil = s.perfis[userId]
    return {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      escopo: 'pessoal',
      materias,
      aulas,
      respostas,
      perfil: { favoritos: perfil?.favoritos ?? [] },
    }
  }

  async exportBiblioteca(): Promise<BackupData> {
    const s = load()
    const materias = s.materias.filter((m) => m.isBiblioteca)
    const materiaIds = new Set(materias.map((m) => m.id))
    return {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      escopo: 'biblioteca',
      materias,
      aulas: s.aulas.filter((a) => materiaIds.has(a.materiaId)),
      respostas: [],
      perfil: { favoritos: [] },
    }
  }

  async importBackup(userId: string, data: BackupData, opts: { paraBiblioteca?: boolean } = {}): Promise<void> {
    const s = load()
    const paraBiblioteca = !!opts.paraBiblioteca
    const idMap = new Map<string, string>()
    for (const m of data.materias) {
      const newId = id()
      idMap.set(m.id, newId)
      // Matéria da biblioteca não tem dono: `user_id` nulo é o que a restrição
      // `materia_dono` do banco exige, e o que separa "conteúdo da plataforma"
      // de "conteúdo de uma pessoa".
      s.materias.push({
        ...m,
        id: newId,
        userId: paraBiblioteca ? null : userId,
        isBiblioteca: paraBiblioteca,
      })
    }
    for (const a of data.aulas) {
      const newMateriaId = idMap.get(a.materiaId)
      if (!newMateriaId) continue
      const newAulaId = id()
      s.aulas.push({
        ...a,
        id: newAulaId,
        materiaId: newMateriaId,
        // A marca vem junto no backup — ver a mesma decisão no repositório
        // Supabase. Restaurar não pode ser um jeito de destravar.
        daBiblioteca: !paraBiblioteca && !!a.daBiblioteca,
        questoes: a.questoes.map((q, i) => ({ ...q, id: `${newAulaId}:q${i}`, aulaId: newAulaId, materiaId: newMateriaId })),
      })
    }
    if (s.perfis[userId]) {
      const merged = new Set([...s.perfis[userId].favoritos, ...data.perfil.favoritos])
      s.perfis[userId].favoritos = Array.from(merged)
    }
    save(s)
  }

  async listGeracoes(userId: string): Promise<GeracaoIA[]> {
    const s = load()
    return s.geracoes.filter((g) => g.userId === userId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  async addGeracao(geracao: Omit<GeracaoIA, 'id' | 'criadoEm'>): Promise<GeracaoIA> {
    const s = load()
    const nova: GeracaoIA = { ...geracao, id: id(), criadoEm: new Date().toISOString() }
    s.geracoes.push(nova)
    save(s)
    return nova
  }

  async listSimulados(userId: string): Promise<Simulado[]> {
    const s = load()
    return s.simulados.filter((sim) => sim.userId === userId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  async registrarSimulado(simulado: Omit<Simulado, 'id' | 'criadoEm'>): Promise<Simulado> {
    const s = load()
    const novo: Simulado = { ...simulado, id: id(), criadoEm: new Date().toISOString() }
    s.simulados.push(novo)
    save(s)
    return novo
  }

  async deleteSimulado(simuladoId: string): Promise<void> {
    const s = load()
    s.simulados = s.simulados.filter((sim) => sim.id !== simuladoId)
    save(s)
  }

  async getCronograma(userId: string): Promise<Cronograma | null> {
    const s = load()
    return s.cronogramas[userId] ?? null
  }

  async upsertCronograma(userId: string, dados: Omit<Cronograma, 'id' | 'userId' | 'criadoEm' | 'atualizadoEm'>): Promise<Cronograma> {
    const s = load()
    const existente = s.cronogramas[userId]
    const now = new Date().toISOString()
    const cronograma: Cronograma = { ...dados, id: existente?.id ?? id(), userId, criadoEm: existente?.criadoEm ?? now, atualizadoEm: now }
    s.cronogramas[userId] = cronograma
    save(s)
    return cronograma
  }

  async deleteCronograma(userId: string): Promise<void> {
    const s = load()
    delete s.cronogramas[userId]
    save(s)
  }
}
