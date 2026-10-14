// ===== Configuração do catálogo =====
// Edite só este arquivo (direto no GitHub) e publique. Não há mais tela de configurações.
//
// IMPORTANTE sobre a chave de API: num site estático (GitHub Pages) ela sempre fica
// visível para quem abrir este arquivo. A proteção correta é restringir a chave no
// Google Cloud Console:
//   1) "Restrições de aplicativo" -> Referenciadores HTTP -> https://SEUUSUARIO.github.io/*
//   2) "Restrições de API"        -> somente "Google Drive API"
// Assim, mesmo que alguém copie a chave, ela não funciona em outro site.

window.CATALOGO_CONFIG = {
  // ID ou link da planilha (compartilhada como "Qualquer pessoa com o link")
  sheet: "https://docs.google.com/spreadsheets/d/1bu89AFDkfMN0Je2VwUeQYoJ4_lTHC72l/edit?gid=1929941225#gid=1929941225",

  // ID ou link da pasta do Drive com as fotos dos PRODUTOS (nome do arquivo = nome do produto)
  folder: "https://drive.google.com/drive/u/4/folders/1rwsl2Rnef2axNCJnEujmciA8HAGKR-6R",

  // ID ou link da pasta do Drive com os POSTS prontos (imagem com logo, preço etc.)
  // Deixe vazio para esconder a aba "Posts".
  postsFolder: "https://drive.google.com/drive/u/4/folders/1sS5TBZjwS8cwP5wtRybJAfdBTLtUlQk5",

  // Chave de API do Google (Drive API)
  // Pasta do Drive com os VÍDEOS para postagem
  videosFolder: "https://drive.google.com/drive/folders/10LKKo8IFqoAP-Bd0fd3T0Iox5Avh2Fe1",

  proxyUrl: "https://script.google.com/macros/s/AKfycbzNWZjCYTNiqoQcLTJl26Mi3SjeBZu3GUTeDNtpksDUlxVXv9BYfXhJmAJk_o6Da850/exec",

  // Texto opcional adicionado no final de toda mensagem (ex.: endereço, horário, telefone)
  rodape: "Entrega e montagem grátis para Ubá e região."
};