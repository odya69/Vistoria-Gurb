# Relatórios compartilhados (todos veem os mesmos dados)

## 1. Criar o banco (grátis, ~5 min)
1. Entre em https://supabase.com, crie uma conta e um **New project** (escolha a região São Paulo).
2. No menu **SQL Editor** > New query: cole todo o conteúdo de `supabase-setup.sql` > **Run**.
   Isso cria as tabelas e já grava a senha de acesso (só o hash dela, nunca o texto).
3. **Project Settings > API**: copie o **Project URL** e a chave **anon public** (ou Publishable key).
4. Abra `shared-config.js`, cole a URL e a chave, salve e publique de novo.

## 2. Como funciona
- Ao abrir o app pela primeira vez no aparelho, pede a senha. Depois ela fica lembrada.
- Cada relatório salvo vai ao servidor; os outros aparelhos recebem em até 30 s (ou em "Sincronizar agora").
- Sem internet, o app continua funcionando e envia tudo quando a conexão voltar.
- Se duas pessoas editarem o mesmo relatório, vale a alteração mais recente.
- Relatórios que já existiam no aparelho sobem ao servidor no primeiro acesso.

## 3. Trocar a senha
No SQL Editor rode (trocando NOVA_SENHA):
update public.rel_config set v = encode(sha256(convert_to('GURB:NOVA_SENHA','utf8')),'hex') where k='pw_hash';
Os aparelhos pedirão a nova senha automaticamente.

## Limites
- Plano grátis do Supabase: 500 MB de banco. Como as fotos ficam dentro dos relatórios, acompanhe o uso.
- Fica de fora da sincronização: configurações (calçada mínima, loteamentos) e o arquivo GeoJSON.
- A senha é uma só para todos. Quem a souber vê e altera tudo.
