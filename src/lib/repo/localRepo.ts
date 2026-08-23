import type { Aula, AulaImportPayload, Bloco, Cronograma, GeracaoIA, Materia, Perfil, Questao, Resposta, Simulado } from '../types'
import type { BackupData, DataRepository, MateriaComContagem } from './types'

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
}

function emptyStore(): Store {
  return { materias: [], aulas: [], respostas: [], perfis: {}, geracoes: [], simulados: [], cronogramas: {} }
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
    return s.aulas.filter((a) => a.materiaId === materiaId)
  }

  async getAula(aulaId: string): Promise<Aula | null> {
    const s = load()
    return s.aulas.find((a) => a.id === aulaId) ?? null
  }

  async listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]> {
    const s = load()
    const materiaIds = new Set(
      s.materias.filter((m) => (m.userId === userId && !m.isBiblioteca) || (includeBiblioteca && m.isBiblioteca)).map((m) => m.id),
    )
    return s.aulas.filter((a) => materiaIds.has(a.materiaId))
  }

  async upsertAula(userId: string, payload: AulaImportPayload, opts: { isBiblioteca: boolean }): Promise<Aula> {
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

  async listRespostas(userId: string): Promise<Resposta[]> {
    const s = load()
    return s.respostas.filter((r) => r.userId === userId)
  }

  async registrarResposta(resposta: Omit<Resposta, 'id' | 'respondidoEm'>): Promise<Resposta> {
    const s = load()
    const nova: Resposta = { ...resposta, id: id(), respondidoEm: new Date().toISOString() }
    s.respostas.push(nova)
    save(s)
    return nova
  }

  async getPerfil(userId: string, email: string): Promise<Perfil> {
    const s = load()
    const adminEmail = ((import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? DEFAULT_ADMIN_EMAIL).toLowerCase()
    const deveSerAdmin = email.toLowerCase() === adminEmail

    if (!s.perfis[userId]) {
      s.perfis[userId] = { userId, email, nome: '', isAdmin: deveSerAdmin, isPremium: false, favoritos: [], chaveGemini: null }
      save(s)
    } else if (deveSerAdmin && !s.perfis[userId].isAdmin) {
      // Corrige perfis criados antes de VITE_ADMIN_EMAIL estar configurada corretamente.
      s.perfis[userId].isAdmin = true
      save(s)
    }
    return s.perfis[userId]
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
      materias,
      aulas,
      respostas,
      perfil: { favoritos: perfil?.favoritos ?? [] },
    }
  }

  async importBackup(userId: string, data: BackupData): Promise<void> {
    const s = load()
    const idMap = new Map<string, string>()
    for (const m of data.materias) {
      const newId = id()
      idMap.set(m.id, newId)
      s.materias.push({ ...m, id: newId, userId })
    }
    for (const a of data.aulas) {
      const newMateriaId = idMap.get(a.materiaId)
      if (!newMateriaId) continue
      const newAulaId = id()
      s.aulas.push({
        ...a,
        id: newAulaId,
        materiaId: newMateriaId,
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
