import type { TipoBloco } from './types'

export const TIPO_BLOCO_LABEL: Record<TipoBloco, string> = {
  texto: 'Teoria',
  dica: 'Dicas',
  alerta: 'Alertas',
  memorize: 'Memorize',
  exemplo: 'Exemplos',
  palavra: 'Atenção à palavra',
  naoconfunda: 'Não confunda',
  tabela: 'Tabelas',
}
