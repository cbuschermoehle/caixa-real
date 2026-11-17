# Como o Caixa Real é publicado

- Código: repositório GitHub `caixa-real` (público; não contém dados).
- Site: GitHub Pages, publicado sozinho pelo arquivo `.github/workflows/publicar.yml` a cada mudança no ramo `main`.
- Dados e login: Supabase (projeto `caixa-real`, região São Paulo).
  - Tabela única `caixa` (uma linha por usuário, dados em JSON), criada por `supabase/schema.sql`.
  - Fotos dos cupons (Lançamento rápido): pasta privada `cupons` no Storage, criada por `supabase/cupons.sql`. Cada usuário só vê a própria subpasta.
  - Endereço e chave pública do Supabase ficam em `.env.production` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). A chave "anon" é pública por natureza; a segurança vem das regras da tabela.
- Sem essas variáveis, o app roda em modo de teste (dados só no navegador), que é o usado no artifact do claude.ai (`npm run artifact`, que compila no modo "teste" e ignora o .env.production).

## Ajustes no painel do Supabase
1. SQL Editor → colar `supabase/schema.sql` → Run.
2. SQL Editor → colar `supabase/cupons.sql` → Run (fotos dos cupons).
3. Authentication → URL Configuration → Site URL = endereço do GitHub Pages; adicionar o mesmo em Redirect URLs.
4. Projetos grátis do Supabase pausam após 7 dias sem uso; basta abrir o painel e clicar em "Restore".
