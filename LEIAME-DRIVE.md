# Como colocar o ID do Google Drive (3 passos)

1. Abra o arquivo **drive-config.js** em qualquer editor de texto (Bloco de Notas serve).
2. Troque `COLE_AQUI_SEU_CLIENT_ID.apps.googleusercontent.com` pelo seu Client ID. Salve.
3. Publique de novo a pasta (ou só o drive-config.js) no seu site.

## Onde conseguir o Client ID
1. https://console.cloud.google.com > crie um projeto.
2. "APIs e serviços" > "Biblioteca" > ative a **Google Drive API**.
3. "Tela de consentimento OAuth": tipo Externo, preencha o nome do app e seu e-mail.
   Em "Usuários de teste", adicione os e-mails que vão usar (enquanto o app estiver em teste).
4. "Credenciais" > "Criar credenciais" > "ID do cliente OAuth" > tipo **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, coloque a URL do app publicado, sem barra no final
   (ex.: https://vistorias.netlify.app). Para testar no computador, adicione também http://localhost:8000
6. Copie o ID gerado (termina com .apps.googleusercontent.com) para o drive-config.js.

Dica: o Client ID não é segredo, pode ficar no arquivo publicado.
