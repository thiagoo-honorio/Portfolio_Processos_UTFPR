# AGENTS.md — Projeto Portfólio de Processos UTFPR

## Regras de trabalho
- **Nunca commitar nem fazer push automaticamente.** Só commitar/envir quando o usuário pedir explicitamente.
- Responder sempre em **português do Brasil (pt-BR)**.
- Projeto interativo HTML/CSS/JS puro (sem build), aberto localmente via `file://` na maioria das vezes.

## Estrutura
- `teste.html` — página principal (navbar, hero, atores, cadeia de valor, fluxo, mapa interativo, rodapé).
- `style.css` — estilos (não usa `url()` para imagens; `box-sizing` global; scroll suave).
- `script.js` — toda a lógica (mapa, atores, etapas, exportações, navegação).
- `imagens/` — diagramas dos fluxos usados na Seção 3 (extraídos dos antigos base64 inline). Referenciados por caminho relativo local (`imagens/<arquivo>.png`).
- `Portfolio_Processos_UTFPR/` — páginas nivel_1…nivel_3 (repositório isolado embutido; `.git` interno foi removido). Contém as cópias locais de `logo_utfpr.png` e `logo_escritorio_processos.png`, referenciadas localmente por ele.

## Imagens
- **Diagramas da Seção 3** (etapas disponibilização/contratação/vigência/encerramento + barra de gestão): arquivos locais em `imagens/diagrama_<step>.png`, referenciados por caminho relativo. Extraídos dos antigos blobs base64 inline (reduziu o `teste.html` de ~986 KB para ~61 KB).
- **Fallback embutido:** os 5 diagramas também ficam embutidos como base64 no `script.js` (`FALLBACK_IMAGENS`, ~924 KB). `paraDataUrlBase64()` os usa quando o navegador bloqueia a leitura de `imagens/` (Chrome em `file://`), garantindo exportações standalone. `diagrama_gestao.png` e `diagrama_disponibilizacao.png` são **idênticos** (mesmo sha1).
- As demais imagens (logotipo, jornadas dos atores, contextualização) são referenciadas por **links do CDN jsDelivr** a partir do GitHub (repo público `thiagoo-honorio/Portfolio_Processos_UTFPR`, branch `master`):
  `https://cdn.jsdelivr.net/gh/thiagoo-honorio/Portfolio_Processos_UTFPR@master/<arquivo>.png`
- **Atenção (estrutura do repo GitHub):** no branch `master` do repo, os logos ficam **dentro da subpasta `Portfolio_Processos_UTFPR/`** — por isso o caminho correto dos logos no `teste.html` inclui o prefixo `...@master/Portfolio_Processos_UTFPR/logo_utfpr.png`. Os logos **existem e carregam** (HTTP 200). As demais (estudante.png, prae.png, orientador.png, jornada_dieem.png, imagem_contextualização.png, assinaturas.png, paineis_resultados.png) **NÃO existem em lugar algum do repo** (nem raiz nem subpasta) e retornam 404 no CDN — são mostradas com o placeholder de `instalarFallbackImagens()`.
- Para arquivos com acentos/espaços, usar URL-encoding (ex.: `imagem_contextualiza%C3%A7%C3%A3o.png`).
- `embutirImagens()` no script.js pula URLs http(s) e `data:`; para caminhos locais (como os de `imagens/`) faz fetch/XHR (funciona em http(s) e Firefox em `file://`; em Chrome em `file://` mantém o caminho original e usa `FALLBACK_IMAGENS`).

## Exportações (em script.js)
- `exportarComoHTML` — arquivo único embutido (base64 via `embutirImagens`); se o navegador bloquear a leitura do script.js avisa; também avisa se as imagens locais de `imagens/` não puderem ser embutidas (resultado `imagensEmbutidas`).
- `exportarComoPDF` — html2pdf; expande todos os atores durante a captura e restaura depois.
- `exportarComoPacote` — ZIP via JSZip: index.html + style.css + script.js **+ pasta `imagens/`** (as PNGs dos diagramas referenciadas por caminho relativo são lidas via `lerArquivoBlob` e adicionadas ao pacote).
- `exportarJSON` — estado completo.
- As exportações **forçam todos os atores expandidos** (`expandirTodosAtores`) e o estado `expandido` de cada ator é salvo no JSON (`capturarAtores`/`criarLinhaAtorHTML`).
- `limparCloneParaExportacao` (usada por HTML e Pacote) além de remover a UI de edição (`#editorToolbar`, `#propertiesPanel`, `#searchContainer`, botões de edição…) **expande todas as seções colapsáveis** (`contextContent`, `suporteContent`, `sec1bContent`, `sec1Content`, `sec2Content`, `sec3Content`) para que o exportado contenha o conteúdo completo.
- `paraDataUrlBase64`/`lerArquivoBlob` tentam `fetch` primeiro (http e Firefox em file://) com fallback para XHR/arraybuffer; em Chrome em file:// a leitura é bloqueada e mantém-se o caminho relativo.

## Validar código JavaScript
- `node --check "script.js"` (`node` v22 disponível).

## Dependências externas (CDN)
- html2pdf (cdnjs), JSZip (cdnjs), Google Fonts Open Sans.