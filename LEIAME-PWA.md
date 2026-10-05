# Relatório fotográfico (PWA)

Arquivos: index.html, manifest.webmanifest, sw.js, icons/

## Publicar (obrigatório HTTPS)
PWA só instala e funciona offline em HTTPS (ou localhost). Opções gratuitas:
- GitHub Pages, Netlify (arraste a pasta em app.netlify.com/drop), Cloudflare Pages ou Firebase Hosting.
- Teste local: `python3 -m http.server 8000` dentro desta pasta e abra http://localhost:8000

## Instalar
- Android (Chrome): menu ⋮ > "Instalar app" / "Adicionar à tela inicial".
- iPhone (Safari): Compartilhar > "Adicionar à Tela de Início".
- Desktop (Chrome/Edge): ícone de instalar na barra de endereço.

## Google Drive
No fim de index.html, em DRIVE_CONFIG, troque CLIENT_ID pelo seu. No Google Cloud Console,
adicione a URL publicada (ex.: https://seusite.netlify.app) em "Origens JavaScript autorizadas".

## Atualizar versão
Ao mudar o index.html, altere CACHE = "vistorias-v1" em sw.js para "vistorias-v2" etc.
Os relatórios ficam no IndexedDB do aparelho e não são afetados.
