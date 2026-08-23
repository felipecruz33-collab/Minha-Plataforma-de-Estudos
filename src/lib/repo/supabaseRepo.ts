import { supabase } from '../supabaseClient'
import type { Aula, AulaImportPayload, Bloco, GeracaoIA, Materia, Perfil, Questao, Resposta } from '../types'
import type { BackupData, DataRepository, MateriaComContagem } from './types'

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

  private async hydrateAula(row: any): Promise<Aula> {
    const [{ data: blocos, error: e1 }, { data: questoes, error: e2 }] = await Promise.all([
      this.db().from('blocos').select('*').eq('aula_id', row.id).order('ordem', { ascending: true }),
      this.db().from('questoes').select('*').eq('aula_id', row.id),
    ])
    if (e1) throw e1
    if (e2) throw e2
    return {
      id: row.id,
      materiaId: row.materia_id,
      titulo: row.titulo,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
      blocos: (blocos ?? []).map((b: any) => ({ tipo: b.tipo, ordem: b.ordem, html: b.html }) as Bloco),
      questoes: (questoes ?? []).map(
        (q: any) =>
          ({
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
          }) as Questao,
      ),
    }
  }

  async listAulas(materiaId: string): Promise<Aula[]> {
    const { data, error } = await this.db().from('aulas').select('*').eq('materia_id', materiaId)
    if (error) throw error
    return Promise.all((data ?? []).map((row) => this.hydrateAula(row)))
  }

  async getAula(aulaId: string): Promise<Aula | null> {
    const { data, error } = await this.db().from('aulas').select('*').eq('id', aulaId).maybeSingle()
    if (error) throw error
    if (!data) return null
    return this.hydrateAula(data)
  }

  async listTodasAulas(userId: string, includeBiblioteca: boolean): Promise<Aula[]> {
    const materias = includeBiblioteca
      ? [...(await this.listMaterias(userId)), ...(await this.listBiblioteca())]
      : await this.listMaterias(userId)
    const aulasPorMateria = await Promise.all(materias.map((m) => this.listAulas(m.id)))
    return aulasPorMateria.flat()
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

    return this.hydrateAula(aula)
  }

  async deleteAula(aulaId: string): Promise<void> {
    const { error } = await this.db().from('aulas').delete().eq('id', aulaId)
    if (error) throw error
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

  async getPerfil(userId: string, email: string): Promise<Perfil> {
    const { data, error } = await this.db().from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    if (!data) {
      return { userId, email, isAdmin: false, isPremium: false, favoritos: [] }
    }
    return { userId: data.id, email: data.email, isAdmin: data.is_admin, isPremium: data.is_premium, favoritos: data.favoritos ?? [] }
  }

  async setPremium(): Promise<void> {
    // Colunas is_admin/is_premium só podem ser alteradas por service_role
    // (ver trigger protect_profile_flags em 0002_rls_policies.sql).
    // No app real, isso acontece via webhook do Google Play Billing, não pelo cliente.
    throw new Error('Alteração de status Premium deve ser feita pelo backend (webhook de assinatura), não pelo cliente.')
  }

  async toggleFavorito(userId: string, questaoId: string): Promise<Perfil> {
    const perfil = await this.getPerfil(userId, '')
    const favoritos = perfil.favoritos.includes(questaoId)
      ? perfil.favoritos.filter((f) => f !== questaoId)
      : [...perfil.favoritos, questaoId]
    const { data, error } = await this.db().from('profiles').update({ favoritos }).eq('id', userId).select().single()
    if (error) throw error
    return { userId: data.id, email: data.email, isAdmin: data.is_admin, isPremium: data.is_premium, favoritos: data.favoritos ?? [] }
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
}
