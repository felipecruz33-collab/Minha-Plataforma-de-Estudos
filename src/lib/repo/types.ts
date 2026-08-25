import type { Aula, AulaImportPayload, Cronograma, GeracaoIA, Materia, Perfil, Questao, Resposta, Simulado } from '../types'

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
  renomearAula(aulaId: string, titulo: string): Promise<Aula>
  /** Grava a ordem das aulas de uma matéria, na sequência em que os ids vierem. */
  reordenarAulas(materiaId: string, aulaIdsEmOrdem: string[]): Promise<void>

  listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]>

  listRespostas(userId: string): Promise<Resposta[]>
  registrarResposta(resposta: Omit<Resposta, 'id' | 'respondidoEm'>): Promise<Resposta>
  /**
   * Apaga as respostas do usuário dentro de um escopo, para que as questões
   * voltem a ficar em branco e possam ser refeitas.
   *
   * O escopo é sempre o mais específico que vier: `aulaId` ganha de
   * `materiaId`, e um objeto vazio significa "todas as minhas respostas".
   * Apagar de verdade (em vez de marcar como "esquecida") mantém uma regra só
   * no app: o histórico É o que aconteceu. O preço é que as tentativas
   * apagadas também saem do Desempenho, da Revisão e das Erradas — por isso a
   * tela avisa disso antes de confirmar.
   */
  esquecerRespostas(userId: string, escopo: { materiaId?: string; aulaId?: string }): Promise<void>

  getPerfil(userId: string, email: string): Promise<Perfil>
  atualizarNome(userId: string, nome: string): Promise<Perfil>
  salvarChaveGemini(userId: string, chave: string | null): Promise<Perfil>
  /** Concede ou remove Premium. Só o administrador consegue (checado no banco, não só na tela). */
  setPremium(userId: string, value: boolean): Promise<void>
  /** Exclui a conta e TODO o conteúdo dela. Só o administrador, e nunca a própria conta. */
  excluirUsuario(userId: string): Promise<void>
  /**
   * Data da PRIMEIRA conversão de cada PDF distinto desde `desdeISO`, em ordem
   * crescente. A tela usa o tamanho pra saber quantos foram usados e a data
   * mais antiga pra dizer quando a cota renova.
   */
  pdfsNoPeriodo(userId: string, desdeISO: string): Promise<string[]>
  toggleFavorito(userId: string, questaoId: string): Promise<Perfil>
  /** Só retorna dados úteis para o administrador — ver RLS em 0003_admin_lista_usuarios.sql. */
  listPerfis(): Promise<Perfil[]>

  exportBackup(userId: string): Promise<BackupData>
  importBackup(userId: string, data: BackupData): Promise<void>

  listGeracoes(userId: string): Promise<GeracaoIA[]>
  addGeracao(geracao: Omit<GeracaoIA, 'id' | 'criadoEm'>): Promise<GeracaoIA>

  listSimulados(userId: string): Promise<Simulado[]>
  registrarSimulado(simulado: Omit<Simulado, 'id' | 'criadoEm'>): Promise<Simulado>
  deleteSimulado(simuladoId: string): Promise<void>

  /** Um cronograma por usuário — "upsert" cria se não existir, substitui se já existir. */
  getCronograma(userId: string): Promise<Cronograma | null>
  upsertCronograma(userId: string, dados: Omit<Cronograma, 'id' | 'userId' | 'criadoEm' | 'atualizadoEm'>): Promise<Cronograma>
  deleteCronograma(userId: string): Promise<void>
}

export function extractQuestoes(aulas: Aula[]): Questao[] {
  return aulas.flatMap((a) => a.questoes)
}
