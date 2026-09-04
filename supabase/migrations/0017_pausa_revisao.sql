-- Pausa e recomeço do ciclo de revisão.
--
-- O ciclo não é gravado em lugar nenhum: ele é CALCULADO a partir da tabela
-- `respostas` (ver src/lib/revisaoEspacada.ts). Isso é ótimo — mudar a régua não
-- invalida dado nenhum —, mas significa que "pausar" e "recomeçar" não teriam
-- onde morar. São estas três colunas, e é tudo que o ciclo guarda.
--
-- Nenhuma delas apaga nada. O histórico de respostas continua inteiro, e a tela
-- de Desempenho continua contando tudo, inclusive o que veio antes de um
-- recomeço. Quem estudou, estudou.

alter table public.profiles
  -- Quando a pausa começou. `null` = ciclo rodando normalmente.
  add column if not exists revisao_pausada_em timestamptz,

  -- Quando a pessoa voltou da última pausa.
  --
  -- É o que impede o "muro" de volta da folga: uma questão respondida ANTES
  -- desta data é tratada como se tivesse sido respondida NELA. Duas semanas
  -- parado não viram duas semanas de atraso acumulado — o prazo simplesmente
  -- reconta a partir do dia em que a pessoa voltou, mantendo o degrau da escada
  -- que ela já tinha conquistado.
  add column if not exists revisao_retomada_em timestamptz,

  -- Marco de recomeço: respostas ANTERIORES a esta data não entram mais no
  -- ciclo. Serve pra quem muda de concurso e não quer arrastar a dívida do
  -- material antigo. É um marco, não um apagador — nada é excluído, e a
  -- estatística de desempenho continua vendo tudo.
  add column if not exists revisao_reinicio timestamptz;

-- As políticas de `profiles` já existem (0002) e valem para as colunas novas:
-- cada um lê e escreve apenas o próprio perfil, então não há o que adicionar.
--
-- Sobre segurança: diferente de `is_premium` e `is_admin`, estas colunas podem
-- ser escritas pelo próprio usuário sem risco nenhum — pausar a própria revisão
-- não dá acesso a nada nem fura limite nenhum. O gatilho `protect_profile_flags`
-- (0006) continua protegendo as duas que importam.
