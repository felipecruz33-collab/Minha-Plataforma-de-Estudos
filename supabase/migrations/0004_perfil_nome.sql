-- Nome de exibição do usuário (coletado no cadastro, editável na tela de Perfil).
-- Atualizável pelo próprio usuário — já coberto pela policy de update existente
-- em 0002 ("profiles: usuário atualiza o próprio perfil"), que não passa por
-- protect_profile_flags (essa trigger só protege is_admin/is_premium).

alter table public.profiles add column if not exists nome text not null default '';
