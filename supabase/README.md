# Backend (Supabase)

Este diretório contém o schema SQL completo do app. O repositório de código
**não** vem conectado a nenhum projeto Supabase — enquanto isso, o app roda
com um repositório local (`localStorage`) que implementa a mesma interface
(`src/lib/repo/types.ts`), então todas as telas funcionam para
desenvolvimento/demonstração sem backend.

## Para ligar a um projeto Supabase real

1. Crie um projeto em https://supabase.com.
2. Rode as migrações, na ordem, no SQL Editor do painel (ou via `supabase db push`):
   - `migrations/0001_schema.sql`
   - `migrations/0002_rls_policies.sql`
   - `migrations/0003_admin_lista_usuarios.sql`
   - `migrations/0004_perfil_nome.sql`
   - `migrations/0005_user_roles.sql`
   - `migrations/0006_simulados.sql`
3. Copie `.env.example` para `.env.local` e preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_EMAIL` (e-mail que deve receber `isAdmin = true`)
4. **Conta administradora** — crie o usuário diretamente em
   Authentication → Users → "Add user" (e-mail/senha), **nunca** pelo
   formulário público de cadastro do app e **nunca** commitando a senha no
   repositório. Depois, promova o perfil dele a admin com o service role
   (não é possível pelo cliente — a RLS bloqueia isso de propósito):

   ```sql
   update public.profiles set is_admin = true where email = 'felipe.cruz33@gmail.com';
   ```

5. Para liberar Premium manualmente (antes de configurar o Google Play
   Billing de verdade), use o mesmo caminho de service role:

   ```sql
   update public.profiles set is_premium = true where email = 'email@exemplo.com';
   ```

## Por que a Biblioteca compartilhada é protegida em dois lugares

A interface já esconde os botões de gestão de quem não é admin, mas a
Seção 3 do prompt original exige que a restrição também exista no banco —
por isso as políticas de RLS em `0002_rls_policies.sql` bloqueiam
inserts/updates/deletes em `materias`/`aulas`/`blocos`/`questoes` da
biblioteca para qualquer usuário que não tenha `is_admin = true`, mesmo que
a chamada não passe pela UI. As colunas `is_admin` e `is_premium` de
`profiles` também só podem ser alteradas pelo `service_role` (trigger
`protect_profile_flags`), nunca pelo próprio usuário autenticado.
