import type { Aula, AulaImportPayload, GeracaoIA, Materia, Perfil, Questao, Resposta } from '../types'

export interface MateriaComContagem extends Materia {
  numAulas: number
}

export interface BackupData {
  versao: 1
  exportadoEm: string
  materias: Materia[]
  aulas: Aula[]
  respostas: Resposta[]
  perfil: Pick<Perfil, 'favoritos'>
}

export interface QuestaoFiltro {
  materia?: string
  banca?: string
  ano?: string
  assunto?: string
  texto?: string
}

/**
 * Contrato único de acesso a dados. Implementado por um repositório local
 * (localStorage, usado quando não há backend configurado) e por um
 * repositório Supabase (usado quando VITE_SUPABASE_URL/ANON_KEY existem).
 * Trocar de implementação não deve exigir mudanças nas telas.
 */
export interface DataRepository {
  listMaterias(userId: string): Promise<MateriaComContagem[]>
  listBiblioteca(): Promise<MateriaComContagem[]>
  getMateria(materiaId: string): Promise<Materia | null>
  createMateriaVazia(userId: string, nome: string, isBiblioteca: boolean): Promise<Materia>
  deleteMateria(materiaId: string): Promise<void>

  listAulas(materiaId: string): Promise<Aula[]>
  getAula(aulaId: string): Promise<Aula | null>
  upsertAula(userId: string, payload: AulaImportPayload, opts: { isBiblioteca: boolean }): Promise<Aula>
  deleteAula(aulaId: string): Promise<void>

  listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]>

  listRespostas(userId: string): Promise<Resposta[]>
  registrarResposta(resposta: Omit<Resposta, 'id' | 'respondidoEm'>): Promise<Resposta>

  getPerfil(userId: string, email: string): Promise<Perfil>
  atualizarNome(userId: string, nome: string): Promise<Perfil>
  setPremium(userId: string, value: boolean): Promise<void>
  toggleFavorito(userId: string, questaoId: string): Promise<Perfil>
  /** Só retorna dados úteis para o administrador — ver RLS em 0003_admin_lista_usuarios.sql. */
  listPerfis(): Promise<Perfil[]>

  exportBackup(userId: string): Promise<BackupData>
  importBackup(userId: string, data: BackupData): Promise<void>

  listGeracoes(userId: string): Promise<GeracaoIA[]>
  addGeracao(geracao: Omit<GeracaoIA, 'id' | 'criadoEm'>): Promise<GeracaoIA>
}

export function extractQuestoes(aulas: Aula[]): Questao[] {
  return aulas.flatMap((a) => a.questoes)
}
