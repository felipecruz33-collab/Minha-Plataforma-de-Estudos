# Minha Plataforma de Estudos

App web mobile-first (PWA) de estudos pessoais para concursos públicos em
geral. Estrutura: **Matéria → Aula → Conteúdo (blocos) + Questões**.
Assinatura mensal via Google Play libera a Biblioteca compartilhada; sem
anúncios em nenhuma tela.

Especificação completa em `docs/SCHEMA.md` (contrato técnico da Seção 6) e
no prompt original do projeto.

## Stack

- React + TypeScript + Vite, Tailwind CSS
- React Router
- Supabase (Postgres + Auth + RLS) como backend, com um repositório local
  (`localStorage`) equivalente para rodar sem backend configurado

## Rodando localmente

```bash
npm install
npm run dev
```

Sem nenhuma variável de ambiente configurada, o app funciona com um
repositório local — dá para criar conta, importar aulas, responder
questões etc. sem depender de um backend.

## Ligando ao Supabase

Veja `supabase/README.md` para as migrações SQL, as políticas de RLS que
protegem a Biblioteca compartilhada, e como criar a conta administradora
com segurança (a senha dela **nunca** deve ir para o repositório).

Copie `.env.example` para `.env.local` e preencha as variáveis para usar
um projeto Supabase real.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção (`tsc -b && vite build`)
- `npm run preview` — pré-visualiza o build de produção
- `npm run lint` — lint

## Estado do "PDF com IA"

A importação de `.json` segue exatamente o contrato da Seção 6 e é
totalmente funcional. A geração automática de aula a partir de PDF está
implementada como um **stub**: extrai o texto do PDF e monta um bloco de
teoria, mas ainda não identifica capítulos nem extrai questões — isso
exige uma chamada a um modelo de linguagem, que não está conectada neste
projeto. O ponto de integração está documentado em
`src/lib/ai/pdfToAula.ts`.
