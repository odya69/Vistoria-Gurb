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

## 3. Histórico de alterações e movimentações
- Abra pelo botão **Histórico de alterações** da tela inicial, por **Histórico de alterações e movimentações** na lista de processos, por **Histórico deste processo** dentro do processo ou pela engrenagem de cada processo.
- Registra, com quem fez e quando: cadastro, alterações de dados (com o valor antigo e o novo), vistoria preenchida, revistoria (e cancelamento), pendência lançada ou removida, deferimento (e volta para análise), mudança de tipo, exclusão e importação de backup.
- Fica no mesmo banco (tabela `rel_historico`), então todos veem o mesmo histórico. É um registro só de inclusão: o app não edita nem apaga eventos.
- Se você já tinha criado o banco, **rode o `supabase-setup.sql` de novo** no SQL Editor (pode repetir sem problema) para criar a tabela e as funções do histórico.
- Não há login: o nome vem do campo "Seu nome", pedido na primeira vez que o app é aberto em cada aparelho (dá para trocar na tela do histórico). Sem nome, aparece "Não identificado".
- Edições seguidas no mesmo processo (digitação) são juntadas em um único registro. Fotos não entram, só a quantidade.
- Só o que for feito depois desta atualização aparece; o que já existia não tem histórico anterior.
- Sem internet, os registros esperam neste aparelho e sobem quando a conexão voltar (aparecem como "aguardando envio").
- Dá para filtrar por texto, tipo de registro e autor, e baixar tudo em CSV.

## Limites
- Plano grátis do Supabase: 500 MB de banco. Como as fotos ficam dentro dos relatórios, acompanhe o uso: a tela inicial do app mostra o tamanho do banco (precisa da função `rel_tamanho`, que está no `supabase-setup.sql`; se atualizou o app depois de criar o banco, rode o arquivo SQL de novo). Se o seu plano tiver outro limite, altere `LIMITE_MB` em `shared-config.js`.
- Fica de fora da sincronização: configurações (calçada mínima, loteamentos) e o arquivo GeoJSON.
- Sem senha, qualquer pessoa que tenha o endereço do app (e abra o código) consegue ler e alterar os relatórios. Compartilhe o link só com quem deve ter acesso.
