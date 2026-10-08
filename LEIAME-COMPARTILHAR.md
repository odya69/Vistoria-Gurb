# Relatórios compartilhados (todos veem os mesmos dados)

## 1. Criar o banco (grátis, ~5 min)
1. Entre em https://supabase.com, crie uma conta e um **New project** (escolha a região São Paulo).
2. No menu **SQL Editor** > New query: cole todo o conteúdo de `supabase-setup.sql` > **Run**.
   Isso cria as tabelas e as funções de acesso. Se você já tinha rodado a versão com senha, rode este arquivo de novo: ele remove a senha.
3. **Project Settings > API**: copie o **Project URL** e a chave **anon public** (ou Publishable key).
4. Abra `shared-config.js`, cole a URL e a chave, salve e publique de novo.

## 2. Como funciona
- O app abre direto, sem senha.
- Cada relatório salvo vai ao servidor; os outros aparelhos recebem em até 30 s (ou em "Sincronizar agora").
- Sem internet, o app continua funcionando e envia tudo quando a conexão voltar.
- Se duas pessoas editarem o mesmo relatório, vale a alteração mais recente.
- Relatórios que já existiam no aparelho sobem ao servidor no primeiro acesso.

## Limites
- Plano grátis do Supabase: 500 MB de banco. Como as fotos ficam dentro dos relatórios, acompanhe o uso: a tela inicial do app mostra o tamanho do banco (precisa da função `rel_tamanho`, que está no `supabase-setup.sql`; se atualizou o app depois de criar o banco, rode o arquivo SQL de novo). Se o seu plano tiver outro limite, altere `LIMITE_MB` em `shared-config.js`.
- Fica de fora da sincronização: configurações (calçada mínima, loteamentos) e o arquivo GeoJSON.
- Sem senha, qualquer pessoa que tenha o endereço do app (e abra o código) consegue ler e alterar os relatórios. Compartilhe o link só com quem deve ter acesso.
