import type { Aula, AulaImportPayload, Cronograma, EstadoDoCicloRevisao, GeracaoIA, Materia, Perfil, Questao, Resposta, Simulado, UsoIA } from '../types'

export interface MateriaComContagem extends Materia {
  numAulas: number
}

export interface BackupData {
  versao: 1
  exportadoEm: string
  /**
   * De onde o arquivo veio. Backups gerados antes deste campo existir não o
   * têm — nesse caso vale 'pessoal', que é o que eles sempre foram.
   *
   * Serve pra tela avisar quando o arquivo escolhido é do tipo errado: um
   * backup pessoal restaurado como biblioteca publicaria o conteúdo de estudo
   * de alguém para todos os assinantes, e o contrário enterraria a biblioteca
   * inteira dentro da conta de uma pessoa só.
   */
  escopo?: 'pessoal' | 'biblioteca'
  materias: Materia[]
  aulas: Aula[]
  respostas: Resposta[]
  perfil: Pick<Perfil, 'favoritos'>
}

/**
 * Aula sem os blocos de conteúdo.
 *
 * Existe porque a tela de Questões precisa do título da aula e das questões,
 * mas nunca mostra o conteúdo — e os blocos são de longe a parte mais pesada
 * (um HTML por bloco, uma dúzia de blocos por aula). Carregá-los ali seria
 * trafegar centenas de kB que a tela joga fora. Um tipo próprio, em vez de uma
 * `Aula` com `blocos: []`, evita que alguém confie num campo vazio achando que
 * a aula não tem conteúdo.
 */
/**
 * A aula sem o conteúdo: só o que uma lista precisa pra mostrar o nome.
 *
 * Existe pra quem só monta listas — o cronograma, por exemplo. Sem isto a
 * alternativa era trazer as aulas COM as questões (ou pior, com os blocos), o
 * que é baixar megabytes pra escrever um título na tela.
 */
export interface AulaBasica {
  id: string
  materiaId: string
  titulo: string
  ordem: number | null
  criadoEm: string
}

export interface AulaComQuestoes {
  id: string
  materiaId: string
  titulo: string
  ordem: number | null
  criadoEm: string
  questoes: Questao[]
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
  upsertAula(
    userId: string,
    payload: AulaImportPayload,
    opts: {
      isBiblioteca: boolean
      /** Marca a aula como cópia da biblioteca — ver `Aula.daBiblioteca`. */
      daBiblioteca?: boolean
    },
  ): Promise<Aula>
  deleteAula(aulaId: string): Promise<void>
  renomearAula(aulaId: string, titulo: string): Promise<Aula>
  /** Grava a ordem das aulas de uma matéria, na sequência em que os ids vierem. */
  reordenarAulas(materiaId: string, aulaIdsEmOrdem: string[]): Promise<void>

  listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]>
  /**
   * Aulas de várias matérias de uma vez, sem os blocos de conteúdo, já
   * ordenadas dentro de cada matéria e na ordem em que as matérias vieram.
   */
  listAulasComQuestoes(materiaIds: string[]): Promise<AulaComQuestoes[]>

  /**
   * Aulas de VÁRIAS matérias numa consulta só, sem questões e sem blocos.
   *
   * Uma chamada, não uma por matéria: pedir em laço vira uma viagem de rede
   * por matéria, todas enfileiradas, e o tempo de abrir a tela passa a crescer
   * junto com o número de matérias da pessoa.
   */
  listAulasBasicas(materiaIds: string[]): Promise<AulaBasica[]>

  /**
   * Tira uma questão do banco de vez.
   *
   * Quem pode é decidido pelo banco, não por esta linha: a RLS permite apagar
   * questão de matéria própria, e questão da biblioteca só para o
   * administrador. As respostas dadas a ela caem junto, por cascata — é o que
   * o schema define, e a tela avisa disso antes de confirmar.
   */
  excluirQuestao(questaoId: string): Promise<void>

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
  /**
   * Apaga as respostas gravadas. O escopo pode ser uma matéria, uma aula, ou
   * uma lista de questões escolhidas a dedo — `questaoIds` tem prioridade,
   * porque é a seleção mais específica que a pessoa pode fazer.
   */
  esquecerRespostas(
    userId: string,
    escopo: { materiaId?: string; aulaId?: string; questaoIds?: string[] },
  ): Promise<void>

  getPerfil(userId: string, email: string): Promise<Perfil>
  atualizarNome(userId: string, nome: string): Promise<Perfil>
  salvarChaveGemini(userId: string, chave: string | null): Promise<Perfil>
  /**
   * Grava o estado do ciclo de revisão (pausa e recomeço).
   *
   * É o único estado que o ciclo guarda — todo o resto sai do histórico de
   * respostas. Requer a migração 0017.
   */
  salvarCicloRevisao(userId: string, ciclo: EstadoDoCicloRevisao): Promise<Perfil>
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
  /**
   * Linhas cruas do medidor de IA desde `desdeISO`. A tela do Premium soma os
   * caracteres pra saber quantas páginas já foram convertidas no mês.
   */
  usoNoPeriodo(userId: string, desdeISO: string): Promise<UsoIA[]>
  toggleFavorito(userId: string, questaoId: string): Promise<Perfil>
  /** Só retorna dados úteis para o administrador — ver RLS em 0003_admin_lista_usuarios.sql. */
  listPerfis(): Promise<Perfil[]>

  exportBackup(userId: string): Promise<BackupData>
  /**
   * Cópia da biblioteca compartilhada — o conteúdo curado que dá mais trabalho
   * pra montar e que nenhum usuário consegue refazer. Fora daqui ele existe em
   * um lugar só, o banco.
   *
   * Não vem no `exportBackup`: aquele exporta o que é DA PESSOA, e as matérias
   * da biblioteca não pertencem a ninguém (`user_id` nulo).
   */
  exportBiblioteca(): Promise<BackupData>
  /**
   * `paraBiblioteca` só funciona pro administrador — quem barra é a RLS do
   * banco, não esta linha. Para qualquer outra conta a gravação é recusada.
   */
  importBackup(userId: string, data: BackupData, opts?: { paraBiblioteca?: boolean }): Promise<void>

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
