# Atualização da sincronização (v2)

## Como aplicar (nesta ordem)
1. **Supabase > SQL Editor**: cole e rode o `supabase-setup.sql` inteiro (pode repetir, não apaga dados).
   Ele cria as funções novas, aumenta o tempo limite do banco, corrige relatórios com data no futuro e limpa registros lixo.
2. Substitua no repositório: `shared.js`, `historico.js`, `sw.js`, `index.html` (mudou só 1 linha) e publique.
   Confira que a pasta `icons/` existe no site publicado.
3. Nos aparelhos: abra o app com internet uma vez (o `sw.js` novo é a versão `vistorias-v28`). Se ficar na versão antiga, feche e abra de novo.

O app funciona mesmo sem o passo 1 (modo compatível), mas mostra o aviso **E-SQL** até você rodar o SQL.

## Códigos de erro mostrados na tela
| Código | Significa | O que fazer |
|---|---|---|
| E-SEMNET | Aparelho sem internet | Nada; envia quando voltar |
| E-REDE | Não alcança o servidor | Testar outra rede; liberar *.supabase.co no firewall; ver se o projeto não está pausado |
| E-TEMPO | Servidor demorou (sinal fraco ou relatório pesado) | Tentar em Wi-Fi; reduzir fotos do relatório citado |
| E-GRANDE | Relatório grande demais | Remover fotos / dividir |
| E-CHAVE | Chave recusada | Conferir URL/KEY em shared-config.js |
| E-SQL / E-PERM / E-SENHA | Banco desatualizado ou sem permissão | Rodar supabase-setup.sql |
| E-DBTEMPO | Banco demorou ao processar | Rodar supabase-setup.sql (aumenta o tempo) |
| E-BANCOCHEIO | Banco cheio / somente leitura (500 MB) | Excluir relatórios antigos ou aumentar o plano |
| E-SERV | Servidor fora do ar (5xx) | Ver painel do Supabase |
| E-LIMITE | Muitas requisições | Aguardar |
| E-DADOS | Servidor recusou os dados | Mandar o Diagnóstico |
| E-RELOGIO | Data/hora do aparelho errada | Ativar data/hora automática |
| E-CONFLITO | Outro aparelho salvou depois; ficou a versão do servidor | Conferir o relatório |
| E-LOCAL | Memória do aparelho cheia | Liberar espaço |
| E-ARMAZ | Navegador bloqueia armazenamento (anônimo / navegador interno de app) | Abrir no Chrome/Safari ou instalar o app |

Na tela inicial, o botão **Diagnóstico** copia um relatório (versão, relógio, fila pendente com tamanho de cada relatório, últimos erros, teste de conexão) para colar numa mensagem ao suporte.
