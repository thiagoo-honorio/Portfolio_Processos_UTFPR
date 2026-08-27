# AGENTS.md — Projeto Portfólio de Processos UTFPR

## Regras de trabalho
- **Nunca commitar nem fazer push automaticamente.** Só commitar/envir quando o usuário pedir explicitamente.
- Responder sempre em **português do Brasil (pt-BR)**.
- Projeto interativo HTML/CSS/JS puro (sem build), aberto localmente via `file://` na maioria das vezes.

## Estrutura
- `teste.html` — página principal (navbar, hero, atores, cadeia de valor, fluxo, mapa interativo, rodapé).
- `style.css` — estilos (não usa `url()` para imagens; `box-sizing` global; scroll suave).
- `script.js` — toda a lógica (mapa, atores, etapas, exportações, navegação).
- `Portfolio_Processos_UTFPR/` — páginas nivel_1…nivel_3 (repositório isolado embutido; `.git` interno foi removido). Contém as cópias locais de `logo_utfpr.png` e `logo_escritorio_processos.png`, referenciadas localmente por ele.

## Imagens
- As imagens são referenciadas por **links do CDN jsDelivr** a partir do GitHub (repo público `thiagoo-honorio/Portfolio_Processos_UTFPR`, branch `master`):
  `https://cdn.jsdelivr.net/gh/thiagoo-honorio/Portfolio_Processos_UTFPR@master/<arquivo>.png`
- Para arquivos com acentos/espaços, usar URL-encoding (ex.: `imagem_contextualiza%C3%A7%C3%A3o.png`).
- `embutirImagens()` no script.js pula URLs http(s) e `data:` — imagens remotas são mantidas na exportação.

## Exportações (em script.js)
- `exportarComoHTML` — arquivo único embutido (base64 via `embutirImagens`); se o navegador bloquear a leitura do script.js, avisa.
- `exportarComoPDF` — html2pdf; expande todos os atores durante a captura e restaura depois.
- `exportarComoPacote` — ZIP (index.html + style.css + script.js) via JSZip.
- `exportarJSON` — estado completo.
- As exportações **forçam todos os atores expandidos** (`expandirTodosAtores`) e o estado `expandido` de cada ator é salvo no JSON (`capturarAtores`/`criarLinhaAtorHTML`).

## Validar código JavaScript
- `node --check "script.js"` (`node` v22 disponível).

## Dependências externas (CDN)
- html2pdf (cdnjs), JSZip (cdnjs), Google Fonts Open Sans.