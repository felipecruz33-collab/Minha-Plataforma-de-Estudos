import { supabase } from '../supabaseClient'
import { ordenarAulas } from '../ordenarAulas'
import { primeiraDataPorArquivo } from './primeiraDataPorArquivo'
import type { Aula, AulaImportPayload, Bloco, Cronograma, GeracaoIA, Materia, Perfil, Questao, Resposta, Simulado } from '../types'
import type { AulaComQuestoes, BackupData, DataRepository, MateriaComContagem } from './types'

function questaoDaLinha(q: any): Questao {
  return {
    id: q.id,
    aulaId: q.aula_id,
    materiaId: q.materia_id,
    tema: q.tema,
    banca: q.banca,
    ano: q.ano,
    orgao: q.orgao,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
    gabarito: q.gabarito,
    explicacao: q.explicacao,
    altExp: q.alt_exp,
  }
}

/**
 * Repositório Supabase — espelha o schema em supabase/migrations/*.sql.
 * As regras de "só admin escreve na biblioteca" e "cada usuário só vê o
 * que é seu" são reforçadas pelo RLS no banco (ver supabase/README.md);
 * aqui apenas fazemos as chamadas.
 */
export class SupabaseRepository implements DataRepository {
  private db() {
    if (!supabase) throw new Error('Supabase não configurado')
    return supabase
  }

  async listMaterias(userId: string): Promise<MateriaComContagem[]> {
    const { data, error } = await this.db()
      .from('materias')
      .select('id,user_id,nome,is_biblioteca,criado_em,aulas(count)')
      .eq('is_biblioteca', false)
      .eq('user_id', userId)
    if (error) throw error
    return (data ?? []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      nome: m.nome,
      isBiblioteca: m.is_biblioteca,
      criadoEm: m.criado_em,
      numAulas: m.aulas?.[0]?.count ?? 0,
    }))
  }

  async listBiblioteca(): Promise<MateriaComContagem[]> {
    const { data, error } = await this.db()
      .from('materias')
      .select('id,user_id,nome,is_biblioteca,criado_em,aulas(count)')
      .eq('is_biblioteca', true)
    if (error) throw error
    return (data ?? []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      nome: m.nome,
      isBiblioteca: m.is_biblioteca,
      criadoEm: m.criado_em,
      numAulas: m.aulas?.[0]?.count ?? 0,
    }))
  }

  async getMateria(materiaId: string): Promise<Materia | null> {
    const { data, error } = await this.db().from('materias').select('*').eq('id', materiaId).maybeSingle()
    if (error) throw error
    if (!data) return null
    return { id: data.id, userId: data.user_id, nome: data.nome, isBiblioteca: data.is_biblioteca, criadoEm: data.criado_em }
  }

  async createMateriaVazia(userId: string, nome: string, isBiblioteca: boolean): Promise<Materia> {
    const { data, error } = await this.db()
      .from('materias')
      .insert({ user_id: isBiblioteca ? null : userId, nome, is_biblioteca: isBiblioteca })
      .select()
      .single()
    if (error) throw error
    return { id: data.id, userId: data.user_id, nome: data.nome, isBiblioteca: data.is_biblioteca, criadoEm: data.criado_em }
  }

  async deleteMateria(materiaId: string): Promise<void> {
    const { error } = await this.db().from('materias').delete().eq('id', materiaId)
    if (error) throw error
  }

  /**
   * Aula com blocos e questões numa requisição só.
   *
   * O PostgREST resolve o aninhamento no próprio banco, seguindo as chaves
   * estrangeiras. Antes cada aula custava duas requisições extras (uma pros
   * blocos, uma pras questões), então abrir uma matéria com 20 aulas eram 41
   * idas ao servidor em vez de 1 — e cada ida paga latência de rede e uma
   * avaliação de RLS por conta própria.
   */
  private static readonly AULA_COMPLETA = '*, blocos(*), questoes(*)'

  /** Só o que a tela de Questões precisa: sem os blocos, que são o texto pesado. */
  private static readonly AULA_SO_QUESTOES = 'id, materia_id, titulo, ordem, criado_em, questoes(*)'

  private montarAula(row: any): Aula {
    const blocos: any[] = row.blocos ?? []
    const questoes: any[] = row.questoes ?? []
    return {
      id: row.id,
      materiaId: row.materia_id,
      titulo: row.titulo,
      ordem: row.ordem ?? null,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
      // A ordem vinha do `order` da consulta; agora que os blocos chegam
      // aninhados, ordenar aqui é o que garante que continue igual.
      blocos: [...blocos]
        .sort((a, b) => a.ordem - b.ordem)
        .map((b: any) => ({ tipo: b.tipo, ordem: b.ordem, html: b.html }) as Bloco),
      questoes: questoes.map(questaoDaLinha),
    }
  }

  async listAulas(materiaId: string): Promise<Aula[]> {
    const { data, error } = await this.db()
      .from('aulas')
      .select(SupabaseRepository.AULA_COMPLETA)
      .eq('materia_id', materiaId)
    if (error) throw error
    // A ordenação é feita aqui (e não no banco) pra ser exatamente a mesma
    // regra dos dois repositórios — inclusive o desempate entre aulas
    // organizadas e nunca organizadas.
    return ordenarAulas((data ?? []).map((row) => this.montarAula(row)))
  }

  async getAula(aulaId: string): Promise<Aula | null> {
    const { data, error } = await this.db()
      .from('aulas')
      .select(SupabaseRepository.AULA_COMPLETA)
      .eq('id', aulaId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return this.montarAula(data)
  }

  /**
   * Busca as aulas de várias matérias de uma vez.
   *
   * Em lotes porque o filtro `in` viaja na URL: com centenas de matérias a
   * requisição estouraria o limite de tamanho do endereço e falharia — de um
   * jeito difícil de diagnosticar, porque só aconteceria com quem tem muito
   * conteúdo.
   */
  private async aulasDeMaterias(materiaIds: string[], colunas: string): Promise<any[]> {
    const LOTE = 50
    const lotes: string[][] = []
    for (let i = 0; i < materiaIds.length; i += LOTE) lotes.push(materiaIds.slice(i, i + LOTE))

    const respostas = await Promise.all(
      lotes.map((ids) => this.db().from('aulas').select(colunas).in('materia_id', ids)),
    )
    const falha = respostas.find((r) => r.error)
    if (falha?.error) throw falha.error
    return respostas.flatMap((r) => (r.data ?? []) as any[])
  }

  async listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]> {
    const materias = includeBiblioteca
      ? [...(await this.listMaterias(userId)), ...(await this.listBiblioteca())]
      : await this.listMaterias(userId)
    const linhas = await this.aulasDeMaterias(
      materias.map((m) => m.id),
      SupabaseRepository.AULA_COMPLETA,
    )
    return linhas.map((row) => this.montarAula(row))
  }

  async listAulasComQuestoes(materiaIds: string[]): Promise<AulaComQuestoes[]> {
    const linhas = await this.aulasDeMaterias(materiaIds, SupabaseRepository.AULA_SO_QUESTOES)
    const porMateria = new Map<string, AulaComQuestoes[]>()
    for (const row of linhas) {
      const aula: AulaComQuestoes = {
        id: row.id,
        materiaId: row.materia_id,
        titulo: row.titulo,
        ordem: row.ordem ?? null,
        criadoEm: row.criado_em,
        questoes: (row.questoes ?? []).map((q: any) => questaoDaLinha(q)),
      }
      const lista = porMateria.get(aula.materiaId)
      if (lista) lista.push(aula)
      else porMateria.set(aula.materiaId, [aula])
    }
    // Cada matéria ordenada por conta própria, na ordem em que as matérias
    // foram pedidas — é assim que a tela espera montar o segundo select.
    return materiaIds.flatMap((id) => ordenarAulas(porMateria.get(id) ?? []))
  }

  async upsertAula(userId: string, payload: AulaImportPayload, opts: { isBiblioteca: boolean }): Promise<Aula> {
    const db = this.db()

    let { data: materia } = await db
      .from('materias')
      .select('*')
      .eq('nome', payload.materia)
      .eq('is_biblioteca', opts.isBiblioteca)
      .maybeSingle()

    if (!materia) {
      const { data: novaMateria, error } = await db
        .from('materias')
        .insert({ user_id: opts.isBiblioteca ? null : userId, nome: payload.materia, is_biblioteca: opts.isBiblioteca })
        .select()
        .single()
      if (error) throw error
      materia = novaMateria
    }

    let { data: aula } = await db.from('aulas').select('*').eq('materia_id', materia.id).eq('titulo', payload.aula.titulo).maybeSingle()

    if (!aula) {
      const { data: novaAula, error } = await db
        .from('aulas')
        .insert({ materia_id: materia.id, titulo: payload.aula.titulo })
        .select()
        .single()
      if (error) throw error
      aula = novaAula
    } else {
      const { error } = await db.from('aulas').update({ atualizado_em: new Date().toISOString() }).eq('id', aula.id)
      if (error) throw error
      await db.from('blocos').delete().eq('aula_id', aula.id)
      await db.from('questoes').delete().eq('aula_id', aula.id)
    }

    if (payload.aula.blocos.length) {
      const { error } = await db.from('blocos').insert(
        payload.aula.blocos.map((b) => ({ aula_id: aula.id, tipo: b.tipo, ordem: b.ordem, html: b.html })),
      )
      if (error) throw error
    }
    if (payload.aula.questoes.length) {
      const { error } = await db.from('questoes').insert(
        payload.aula.questoes.map((q) => ({
          aula_id: aula.id,
          materia_id: materia.id,
          tema: q.tema,
          banca: q.banca,
          ano: q.ano,
          orgao: q.orgao,
          enunciado: q.enunciado,
          alternativas: q.alternativas,
          gabarito: q.gabarito,
          explicacao: q.explicacao,
          alt_exp: q.altExp,
        })),
      )
      if (error) throw error
    }

    return this.aulaObrigatoria(aula.id)
  }

  /** Relê a aula inteira (com blocos e questões) depois de gravar. */
  private async aulaObrigatoria(aulaId: string): Promise<Aula> {
    const aula = await this.getAula(aulaId)
    if (!aula) throw new Error('A aula foi salva mas não pôde ser lida de volta.')
    return aula
  }

  async deleteAula(aulaId: string): Promise<void> {
    const { error } = await this.db().from('aulas').delete().eq('id', aulaId)
    if (error) throw error
  }

  async renomearAula(aulaId: string, titulo: string): Promise<Aula> {
    const { error } = await this.db().from('aulas').update({ titulo }).eq('id', aulaId)
    if (error) throw error
    return this.aulaObrigatoria(aulaId)
  }

  async reordenarAulas(materiaId: string, aulaIdsEmOrdem: string[]): Promise<void> {
    // Uma atualização por aula em vez de um upsert em lote: o upsert exigiria
    // mandar a linha inteira de volta, e um campo esquecido no caminho
    // apagaria dado de verdade. Aqui só a coluna `ordem` é tocada.
    const resultados = await Promise.all(
      aulaIdsEmOrdem.map((aulaId, i) => this.db().from('aulas').update({ ordem: i }).eq('id', aulaId).eq('materia_id', materiaId)),
    )
    const falha = resultados.find((r) => r.error)
    if (falha?.error) throw falha.error
  }

  async listRespostas(userId: string): Promise<Resposta[]> {
    const { data, error } = await this.db().from('respostas').select('*').eq('user_id', userId)
    if (error) throw error
    return (data ?? []).map(
      (r: any) =>
        ({
          id: r.id,
          userId: r.user_id,
          questaoId: r.questao_id,
          aulaId: r.aula_id,
          materiaId: r.materia_id,
          alternativaEscolhida: r.alternativa_escolhida,
          correta: r.correta,
          respondidoEm: r.respondido_em,
        }) as Resposta,
    )
  }

  async registrarResposta(resposta: Omit<Resposta, 'id' | 'respondidoEm'>): Promise<Resposta> {
    const { data, error } = await this.db()
      .from('respostas')
      .insert({
        user_id: resposta.userId,
        questao_id: resposta.questaoId,
        aula_id: resposta.aulaId,
        materia_id: resposta.materiaId,
        alternativa_escolhida: resposta.alternativaEscolhida,
        correta: resposta.correta,
      })
      .select()
      .single()
    if (error) throw error
    return {
      id: data.id,
      userId: data.user_id,
      questaoId: data.questao_id,
      aulaId: data.aula_id,
      materiaId: data.materia_id,
      alternativaEscolhida: data.alternativa_escolhida,
      correta: data.correta,
      respondidoEm: data.respondido_em,
    }
  }

  async esquecerRespostas(userId: string, escopo: { materiaId?: string; aulaId?: string }): Promise<void> {
    // O `eq('user_id', ...)` é redundante com a RLS ("respostas: acesso
    // próprio", em 0002) — mas sem ele um erro de escopo aqui viraria um
    // DELETE sem filtro nenhum, e é melhor que a rede nunca chegue a carregar
    // essa requisição.
    let consulta = this.db().from('respostas').delete().eq('user_id', userId)
    if (escopo.aulaId) consulta = consulta.eq('aula_id', escopo.aulaId)
    else if (escopo.materiaId) consulta = consulta.eq('materia_id', escopo.materiaId)
    const { error } = await consulta
    if (error) throw error
  }

  /**
   * O admin é considerado true se profiles.is_admin OU a tabela user_roles
   * disserem que sim (0005_user_roles.sql) — duas fontes independentes,
   * verificadas separadamente aqui porque a RPC tem sua própria política de
   * segurança e não depende de o SELECT em profiles ter vindo "certo".
   */
  private async checarPapelAdmin(userId: string): Promise<boolean> {
    const { data, error } = await this.db().rpc('has_role', { _user_id: userId, _role: 'admin' })
    if (error) {
      console.error('has_role() falhou:', error)
      return false
    }
    return Boolean(data)
  }

  private async hydratePerfil(userId: string, email: string, data: any | null): Promise<Perfil> {
    const isAdminViaRole = await this.checarPapelAdmin(userId)
    if (!data) {
      return { userId, email, nome: '', isAdmin: isAdminViaRole, isPremium: false, favoritos: [], chaveGemini: null }
    }
    return {
      userId: data.id,
      email: data.email,
      nome: data.nome ?? '',
      isAdmin: Boolean(data.is_admin) || isAdminViaRole,
      isPremium: data.is_premium,
      favoritos: data.favoritos ?? [],
      chaveGemini: data.chave_gemini ?? null,
    }
  }

  async getPerfil(userId: string, email: string): Promise<Perfil> {
    const { data, error } = await this.db().from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    return this.hydratePerfil(userId, email, data)
  }

  async atualizarNome(userId: string, nome: string): Promise<Perfil> {
    const { data, error } = await this.db().from('profiles').update({ nome }).eq('id', userId).select().single()
    if (error) throw error
    return this.hydratePerfil(userId, data.email, data)
  }

  async listPerfis(): Promise<Perfil[]> {
    // RLS (0003_admin_lista_usuarios.sql) só devolve todas as linhas para quem é admin;
    // para qualquer outro usuário, o Supabase já filtra e devolve só a própria linha.
    const { data, error } = await this.db().from('profiles').select('*').order('criado_em', { ascending: false })
    if (error) throw error
    return (data ?? []).map((p: any) => ({
      userId: p.id,
      email: p.email,
      nome: p.nome ?? '',
      isAdmin: p.is_admin,
      isPremium: p.is_premium,
      favoritos: p.favoritos ?? [],
      chaveGemini: p.chave_gemini ?? null,
    }))
  }

  async setPremium(userId: string, value: boolean): Promise<void> {
    // Quem autoriza é o banco, não esta linha: o gatilho protect_profile_flags
    // (0012_admin_premium_e_exclusao.sql) só deixa is_premium mudar quando
    // quem chama é admin. Para qualquer outro usuário a atualização passa sem
    // erro e simplesmente não muda nada -- por isso relemos o perfil depois e
    // avisamos, em vez de assumir que deu certo.
    const { error } = await this.db().from('profiles').update({ is_premium: value }).eq('id', userId)
    if (error) throw error
    const { data, error: erroLeitura } = await this.db().from('profiles').select('is_premium').eq('id', userId).maybeSingle()
    if (erroLeitura) throw erroLeitura
    if (data && data.is_premium !== value) {
      throw new Error(
        'O banco recusou a mudança de Premium. Confira se a migração 0012_admin_premium_e_exclusao.sql foi aplicada no Supabase.',
      )
    }
  }

  async excluirUsuario(userId: string): Promise<void> {
    // Apagar só a linha de profiles deixaria o login vivo em auth.users --
    // a pessoa continuaria entrando, sem perfil. A função no banco apaga de
    // auth.users, e o `on delete cascade` do schema leva junto matérias,
    // aulas, respostas e gerações.
    const { error } = await this.db().rpc('admin_excluir_usuario', { alvo: userId })
    if (error) throw error
  }

  async pdfsNoPeriodo(userId: string, desdeISO: string): Promise<string[]> {
    // Lê `uso_ia`, não `geracoes_ia`: é a tabela que a função serverless grava
    // ANTES de chamar a IA, e é por ela que o limite é cobrado. Contar pela
    // outra deixaria a tela mostrando um número diferente do que o servidor
    // aplica — e a pessoa levaria uma recusa sem entender por quê.
    const { data, error } = await this.db()
      .from('uso_ia')
      .select('arquivo, criado_em')
      .eq('user_id', userId)
      .gte('criado_em', desdeISO)
    if (error) throw error
    return primeiraDataPorArquivo(
      (data ?? []).map((u: { arquivo: string; criado_em: string }) => ({ nome: u.arquivo, data: u.criado_em })),
    )
  }

  async toggleFavorito(userId: string, questaoId: string): Promise<Perfil> {
    const perfil = await this.getPerfil(userId, '')
    const favoritos = perfil.favoritos.includes(questaoId)
      ? perfil.favoritos.filter((f) => f !== questaoId)
      : [...perfil.favoritos, questaoId]
    const { data, error } = await this.db().from('profiles').update({ favoritos }).eq('id', userId).select().single()
    if (error) throw error
    return {
      userId: data.id,
      email: data.email,
      nome: data.nome ?? '',
      isAdmin: data.is_admin,
      isPremium: data.is_premium,
      favoritos: data.favoritos ?? [],
      chaveGemini: data.chave_gemini ?? null,
    }
  }

  async salvarChaveGemini(userId: string, chave: string | null): Promise<Perfil> {
    const { data, error } = await this.db()
      .from('profiles')
      .update({ chave_gemini: chave })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return this.hydratePerfil(userId, data.email, data)
  }

  async exportBackup(userId: string): Promise<BackupData> {
    const materias = await this.listMaterias(userId)
    const aulas = (await Promise.all(materias.map((m) => this.listAulas(m.id)))).flat()
    const respostas = await this.listRespostas(userId)
    const perfil = await this.getPerfil(userId, '')
    return { versao: 1, exportadoEm: new Date().toISOString(), materias, aulas, respostas, perfil: { favoritos: perfil.favoritos } }
  }

  async importBackup(userId: string, data: BackupData): Promise<void> {
    for (const materia of data.materias) {
      const aulasDaMateria = data.aulas.filter((a) => a.materiaId === materia.id)
      for (const aula of aulasDaMateria) {
        await this.upsertAula(
          userId,
          {
            materia: materia.nome,
            aula: {
              titulo: aula.titulo,
              blocos: aula.blocos,
              questoes: aula.questoes.map((q) => ({
                tema: q.tema,
                banca: q.banca,
                ano: q.ano,
                orgao: q.orgao,
                enunciado: q.enunciado,
                alternativas: q.alternativas,
                gabarito: q.gabarito,
                explicacao: q.explicacao,
                altExp: q.altExp,
              })),
            },
          },
          { isBiblioteca: false },
        )
      }
    }
  }

  async listGeracoes(userId: string): Promise<GeracaoIA[]> {
    const { data, error } = await this.db().from('geracoes_ia').select('*').eq('user_id', userId).order('criado_em', { ascending: false })
    if (error) throw error
    return (data ?? []).map(
      (g: any) =>
        ({
          id: g.id,
          userId: g.user_id,
          nomeArquivo: g.nome_arquivo,
          materia: g.materia,
          aulaTitulo: g.aula_titulo,
          status: g.status,
          mensagem: g.mensagem,
          criadoEm: g.criado_em,
        }) as GeracaoIA,
    )
  }

  async addGeracao(geracao: Omit<GeracaoIA, 'id' | 'criadoEm'>): Promise<GeracaoIA> {
    const { data, error } = await this.db()
      .from('geracoes_ia')
      .insert({
        user_id: geracao.userId,
        nome_arquivo: geracao.nomeArquivo,
        materia: geracao.materia,
        aula_titulo: geracao.aulaTitulo,
        status: geracao.status,
        mensagem: geracao.mensagem,
      })
      .select()
      .single()
    if (error) throw error
    return {
      id: data.id,
      userId: data.user_id,
      nomeArquivo: data.nome_arquivo,
      materia: data.materia,
      aulaTitulo: data.aula_titulo,
      status: data.status,
      mensagem: data.mensagem,
      criadoEm: data.criado_em,
    }
  }

  async listSimulados(userId: string): Promise<Simulado[]> {
    const { data, error } = await this.db().from('simulados').select('*').eq('user_id', userId).order('criado_em', { ascending: false })
    if (error) throw error
    return (data ?? []).map(
      (s: any) =>
        ({
          id: s.id,
          userId: s.user_id,
          nome: s.nome,
          materias: s.materias,
          tempoLimiteSegundos: s.tempo_limite_segundos,
          duracaoSegundos: s.duracao_segundos,
          totalQuestoes: s.total_questoes,
          acertos: s.acertos,
          criadoEm: s.criado_em,
        }) as Simulado,
    )
  }

  async registrarSimulado(simulado: Omit<Simulado, 'id' | 'criadoEm'>): Promise<Simulado> {
    const { data, error } = await this.db()
      .from('simulados')
      .insert({
        user_id: simulado.userId,
        nome: simulado.nome,
        materias: simulado.materias,
        tempo_limite_segundos: simulado.tempoLimiteSegundos,
        duracao_segundos: simulado.duracaoSegundos,
        total_questoes: simulado.totalQuestoes,
        acertos: simulado.acertos,
      })
      .select()
      .single()
    if (error) throw error
    return {
      id: data.id,
      userId: data.user_id,
      nome: data.nome,
      materias: data.materias,
      tempoLimiteSegundos: data.tempo_limite_segundos,
      duracaoSegundos: data.duracao_segundos,
      totalQuestoes: data.total_questoes,
      acertos: data.acertos,
      criadoEm: data.criado_em,
    }
  }

  async deleteSimulado(simuladoId: string): Promise<void> {
    const { error } = await this.db().from('simulados').delete().eq('id', simuladoId)
    if (error) throw error
  }

  async getCronograma(userId: string): Promise<Cronograma | null> {
    const { data, error } = await this.db().from('cronogramas').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      id: data.id,
      userId: data.user_id,
      nome: data.nome,
      modo: data.modo,
      dataInicio: data.data_inicio,
      dataFim: data.data_fim,
      materias: data.materias,
      semanas: data.semanas,
      criadoEm: data.criado_em,
      atualizadoEm: data.atualizado_em,
    }
  }

  async upsertCronograma(userId: string, dados: Omit<Cronograma, 'id' | 'userId' | 'criadoEm' | 'atualizadoEm'>): Promise<Cronograma> {
    const { data, error } = await this.db()
      .from('cronogramas')
      .upsert(
        {
          user_id: userId,
          nome: dados.nome,
          modo: dados.modo,
          data_inicio: dados.dataInicio,
          data_fim: dados.dataFim,
          materias: dados.materias,
          semanas: dados.semanas,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single()
    if (error) throw error
    return {
      id: data.id,
      userId: data.user_id,
      nome: data.nome,
      modo: data.modo,
      dataInicio: data.data_inicio,
      dataFim: data.data_fim,
      materias: data.materias,
      semanas: data.semanas,
      criadoEm: data.criado_em,
      atualizadoEm: data.atualizado_em,
    }
  }

  async deleteCronograma(userId: string): Promise<void> {
    const { error } = await this.db().from('cronogramas').delete().eq('user_id', userId)
    if (error) throw error
  }
}
