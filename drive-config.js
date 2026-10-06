/* ============================================================
   CONFIGURAÇÃO DO GOOGLE DRIVE
   ------------------------------------------------------------
   É SÓ ISSO QUE VOCÊ PRECISA EDITAR:
   Troque o texto entre aspas em CLIENT_ID pelo seu
   "ID do cliente" do Google Cloud Console.
   Ele termina com .apps.googleusercontent.com

   Exemplo:
   CLIENT_ID: "1234567890-abcdefg.apps.googleusercontent.com",
   ============================================================ */
window.DRIVE_CONFIG = {
  CLIENT_ID: "COLE_AQUI_SEU_CLIENT_ID.apps.googleusercontent.com",

  /* Nome da pasta criada no Drive de quem entrar (pode deixar assim) */
  FOLDER_NAME: "Relatórios GURB Norte",

  /* Não mude: o app só enxerga os arquivos que ele mesmo criar */
  SCOPE: "https://www.googleapis.com/auth/drive.file"
};
