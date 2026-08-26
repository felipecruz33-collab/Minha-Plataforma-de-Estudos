import type { Aula, AulaImportPayload, Cronograma, GeracaoIA, Materia, Perfil, Resposta, Simulado } from '../types'
import type { AulaComQuestoes, BackupData, DataRepository, MateriaComContagem } from './types'

/**
 * Quanto tempo uma leitura vale antes de ser buscada de novo.
 *
 * Dois minutos porque o que muda sem a gente saber é raro: outro aparelho seu,
 * ou uma aula nova que você publicou na biblioteca. Tudo que a PRÓPRIA pessoa
 * faz já limpa o cache na hora, então este prazo não atrasa nada do que ela vê
 * acontecer.
 */
const VALIDADE_MS = 2 * 60 * 1000

/**
 * Guarda as leituras entre uma tela e outra.
 *
 * O problema que isto resolve: cada tela refazia todas as consultas do zero ao
 * ser aberta. Ir para Desempenho e voltar para Questões custava a mesma espera
 * de novo, e nenhuma linha do banco tinha mudado no caminho. Com pouca coisa
 * cadastrada o tempo nem é do banco — é da ida e volta pela rede, que acontece
 * igual com uma questão ou com mil.
 *
 * A regra de invalidação é grosseira DE PROPÓSITO: qualquer escrita joga o
 * cache inteiro fora. É impossível servir dado velho depois de uma alteração,
 * que é o único erro caro aqui. O custo — reconsultar coisas que não mudaram —
 * é uma ida à rede que a pessoa já esperava, porque acabou de salvar algo.
 */
export class CachedRepository implements DataRepository {
  private cache = new Map<string, { em: number; valor: Promise<unknown> }>()

  constructor(private readonly base: DataRepository) {}

  /** Limpa tudo. Chamado por toda escrita, e na troca de conta. */
  limpar(): void {
    this.cache.clear()
  }

  private ler<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
    const guardado = this.cache.get(chave)
    if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor as Promise<T>

    // Guarda a PROMESSA, não o resultado: duas telas que pedem a mesma coisa
    // ao mesmo tempo (acontece o tempo todo no React) compartilham uma única
    // ida à rede em vez de disparar duas.
    const valor = buscar().catch((erro) => {
      // Erro não fica em cache — senão uma falha de rede momentânea
      // condenaria a tela pelos próximos dois minutos.
      this.cache.delete(chave)
      throw erro
    })
    this.podar()
    this.cache.set(chave, { em: Date.now(), valor })
    return valor
  }

  /**
   * Descarta o que já venceu.
   *
   * Sem isto o mapa só cresceria: uma entrada vencida nunca é lida, mas também
   * nunca sairia — e cada aula guardada carrega os blocos e as questões dela.
   * Numa sessão longa, navegando por dezenas de aulas, isso vira memória presa
   * à toa no celular.
   */
  private podar(): void {
    const agora = Date.now()
    for (const [chave, item] of this.cache) {
      if (agora - item.em >= VALIDADE_MS) this.cache.delete(chave)
    }
  }

  private escrever<T>(acao: () => Promise<T>): Promise<T> {
    // Limpa ANTES e DEPOIS. Antes, porque uma leitura disparada enquanto a
    // escrita acontece traria o estado anterior; depois, porque é o estado
    // novo que precisa valer daqui pra frente.
    this.limpar()
    return acao().finally(() => this.limpar())
  }

  // ---------------------------------------------------------------- leituras

  listMaterias(userId: string) {
    return this.ler(`materias:${userId}`, () => this.base.listMaterias(userId))
  }
  listBiblioteca() {
    return this.ler('biblioteca', () => this.base.listBiblioteca())
  }
  getMateria(materiaId: string) {
    return this.ler(`materia:${materiaId}`, () => this.base.getMateria(materiaId))
  }
  listAulas(materiaId: string) {
    return this.ler(`aulas:${materiaId}`, () => this.base.listAulas(materiaId))
  }
  getAula(aulaId: string) {
    return this.ler(`aula:${aulaId}`, () => this.base.getAula(aulaId))
  }
  listTodasAulas(userId: string, includeBiblioteca: boolean) {
    return this.ler(`todasAulas:${userId}:${includeBiblioteca}`, () =>
      this.base.listTodasAulas(userId, includeBiblioteca),
    )
  }
  listAulasComQuestoes(materiaIds: string[]) {
    return this.ler(`aulasComQuestoes:${materiaIds.join(',')}`, () => this.base.listAulasComQuestoes(materiaIds))
  }
  listRespostas(userId: string) {
    return this.ler(`respostas:${userId}`, () => this.base.listRespostas(userId))
  }
  getPerfil(userId: string, email: string) {
    return this.ler(`perfil:${userId}`, () => this.base.getPerfil(userId, email))
  }
  pdfsNoPeriodo(userId: string, desdeISO: string) {
    // Sem cache DE PROPÓSITO. `desdeISO` é "agora menos 7 dias", ou seja, um
    // texto diferente a cada milissegundo: a chave nunca se repetiria, o cache
    // nunca acertaria, e cada chamada deixaria uma entrada nova para sempre na
    // memória. É chamada uma vez ao abrir a tela de importar, e é barata.
    return this.base.pdfsNoPeriodo(userId, desdeISO)
  }
  listPerfis() {
    return this.ler('perfis', () => this.base.listPerfis())
  }
  listGeracoes(userId: string) {
    return this.ler(`geracoes:${userId}`, () => this.base.listGeracoes(userId))
  }
  listSimulados(userId: string) {
    return this.ler(`simulados:${userId}`, () => this.base.listSimulados(userId))
  }
  getCronograma(userId: string) {
    return this.ler(`cronograma:${userId}`, () => this.base.getCronograma(userId))
  }
  exportBackup(userId: string) {
    // Sem cache: é raro, é grande, e um backup precisa ser do estado de agora.
    return this.base.exportBackup(userId)
  }
  exportBiblioteca() {
    return this.base.exportBiblioteca()
  }

  // ---------------------------------------------------------------- escritas

  createMateriaVazia(userId: string, nome: string, isBiblioteca: boolean) {
    return this.escrever(() => this.base.createMateriaVazia(userId, nome, isBiblioteca))
  }
  deleteMateria(materiaId: string) {
    return this.escrever(() => this.base.deleteMateria(materiaId))
  }
  upsertAula(userId: string, payload: AulaImportPayload, opts: { isBiblioteca: boolean }) {
    return this.escrever(() => this.base.upsertAula(userId, payload, opts))
  }
  deleteAula(aulaId: string) {
    return this.escrever(() => this.base.deleteAula(aulaId))
  }
  renomearAula(aulaId: string, titulo: string) {
    return this.escrever(() => this.base.renomearAula(aulaId, titulo))
  }
  reordenarAulas(materiaId: string, aulaIdsEmOrdem: string[]) {
    return this.escrever(() => this.base.reordenarAulas(materiaId, aulaIdsEmOrdem))
  }
  registrarResposta(resposta: Omit<Resposta, 'id' | 'respondidoEm'>) {
    return this.escrever(() => this.base.registrarResposta(resposta))
  }
  esquecerRespostas(userId: string, escopo: { materiaId?: string; aulaId?: string }) {
    return this.escrever(() => this.base.esquecerRespostas(userId, escopo))
  }
  atualizarNome(userId: string, nome: string) {
    return this.escrever(() => this.base.atualizarNome(userId, nome))
  }
  salvarChaveGemini(userId: string, chave: string | null) {
    return this.escrever(() => this.base.salvarChaveGemini(userId, chave))
  }
  setPremium(userId: string, value: boolean) {
    return this.escrever(() => this.base.setPremium(userId, value))
  }
  excluirUsuario(userId: string) {
    return this.escrever(() => this.base.excluirUsuario(userId))
  }
  toggleFavorito(userId: string, questaoId: string) {
    return this.escrever(() => this.base.toggleFavorito(userId, questaoId))
  }
  importBackup(userId: string, data: BackupData, opts?: { paraBiblioteca?: boolean }) {
    return this.escrever(() => this.base.importBackup(userId, data, opts))
  }
  addGeracao(geracao: Omit<GeracaoIA, 'id' | 'criadoEm'>) {
    return this.escrever(() => this.base.addGeracao(geracao))
  }
  registrarSimulado(simulado: Omit<Simulado, 'id' | 'criadoEm'>) {
    return this.escrever(() => this.base.registrarSimulado(simulado))
  }
  deleteSimulado(simuladoId: string) {
    return this.escrever(() => this.base.deleteSimulado(simuladoId))
  }
  upsertCronograma(userId: string, dados: Omit<Cronograma, 'id' | 'userId' | 'criadoEm' | 'atualizadoEm'>) {
    return this.escrever(() => this.base.upsertCronograma(userId, dados))
  }
  deleteCronograma(userId: string) {
    return this.escrever(() => this.base.deleteCronograma(userId))
  }
}

// Reexportados só para o TypeScript não reclamar de tipos não usados nas
// assinaturas acima quando o arquivo é lido isoladamente.
export type { Aula, AulaComQuestoes, Materia, MateriaComContagem, Perfil }
