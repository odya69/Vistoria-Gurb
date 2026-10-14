# Mapa de inscrições

O arquivo `inscricoes.geojson` desta pasta é baixado pelo app e usado para localizar cada processo
pela inscrição imobiliária (botão Mapa e ordem da rota de vistorias).

**Para trocar por uma versão nova:** suba o novo arquivo aqui com o **mesmo nome** (`inscricoes.geojson`),
substituindo o atual. Nos aparelhos, o app percebe a mudança sozinho na próxima vez que for aberto
(com internet) e baixa a versão nova. Em Configurações há também o botão "Atualizar do site agora".

O arquivo precisa ser um GeoJSON em latitude/longitude (WGS 84) e ter um campo com a inscrição imobiliária.
