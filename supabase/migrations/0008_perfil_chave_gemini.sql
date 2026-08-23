-- Chave própria e opcional da API do Gemini por usuário (Perfil → "PDF com IA").
-- Já coberta pela política existente "profiles: usuário atualiza o próprio perfil"
-- (0002_rls_policies.sql) — não precisa de policy nova, e o trigger
-- protect_profile_flags só protege is_admin/is_premium, não essa coluna.

alter table public.profiles add column if not exists chave_gemini text;
