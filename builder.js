/* ==========================================================================
   CONSTRUTOR DE PÁGINAS (APB)
   Editor visual isolado, com estado versionado, sanitização e exportação.
   ========================================================================== */
(function () {
    'use strict';

    const VERSAO = 1;
    const LS_KEY = 'utfpr_page_builder_v1';
    const LS_BACKUP = 'utfpr_page_builder_v1_backup';
    const MAX_HISTORICO = 60;
    const LIMITES = { paginas: 50, secoes: 60, blocos: 200, html: 60000, texto: 6000, imagem: 4 * 1024 * 1024 };

    const FONTES = {
        'Open Sans': { stack: "'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", google: 'Open+Sans:wght@400;600;700;800' },
        'Inter': { stack: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", google: 'Inter:wght@400;600;700;800' },
        'Lora': { stack: "'Lora', Georgia, 'Times New Roman', serif", google: 'Lora:wght@400;600;700' },
        'Georgia': { stack: "Georgia, 'Times New Roman', serif" },
        'Arial': { stack: 'Arial, Helvetica, sans-serif' }
    };

    const PRESETS = {
        conteudo: { nome: 'Conteúdo', dica: 'Seção branca com título e blocos.' },
        destaque: { nome: 'Destaque', dica: 'Faixa com fundo suave da cor principal.' },
        hero: { nome: 'Hero', dica: 'Abertura com gradiente, centralizada.' }
    };

    const TIPOS_BLOCO = {
        texto: 'Texto',
        titulo: 'Título',
        imagem: 'Imagem',
        link: 'Link / botão',
        lista: 'Lista',
        citacao: 'Citação',
        divisor: 'Divisor',
        espacador: 'Espaçamento'
    };

    const CORES_RAPIDAS = ['#2563eb', '#0f766e', '#7c3aed', '#b91c1c', '#c2410c', '#0f172a'];
    const TAGS_PERMITIDAS = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'code', 'pre', 'span', 'hr']);

    let estado = null;
    let selecao = { tipo: 'pagina', id: null };
    let aberto = false;
    let previa = false;
    let sujo = false;
    let ultimoSalvoEm = null;
    let timerAuto = null;
    let antesEdicao = null;
    let antesInsp = null;
    let historico = [];
    let refazerPilha = [];
    let imagemAlvoId = null;
    let modalResolver = null;
    let refs = {};
    let sequencia = 0;

    function uid(prefixo) {
        sequencia += 1;
        let aleatorio;
        try {
            aleatorio = (window.crypto && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID().slice(0, 8)
                : Math.random().toString(36).slice(2, 10);
        } catch (erro) {
            aleatorio = Math.random().toString(36).slice(2, 10);
        }
        return prefixo + '_' + Date.now().toString(36) + '_' + aleatorio + sequencia.toString(36);
    }

    function agora() { return new Date().toISOString(); }
    function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

    function esc(valor) {
        return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function texto(valor, limite) {
        const max = limite || LIMITES.texto;
        return String(valor == null ? '' : valor)
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
            .slice(0, max);
    }

    function slugify(valor) {
        return String(valor == null ? '' : valor)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-{2,}/g, '-')
            .slice(0, 60) || 'pagina';
    }

    function cor(valor, padrao) {
        let v = String(valor == null ? '' : valor).trim();
        if (/^#[0-9a-f]{3}$/i.test(v)) {
            v = '#' + v.slice(1).split('').map(function (c) { return c + c; }).join('');
        }
        return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : padrao;
    }

    function corRgba(hex, alfa) {
        const h = cor(hex, '#2563eb').slice(1);
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alfa + ')';
    }

    function fonteValida(nome) {
        return Object.prototype.hasOwnProperty.call(FONTES, nome) ? nome : 'Open Sans';
    }

    function urlSegura(valor) {
        const v = String(valor == null ? '' : valor).trim();
        if (!v) return '';
        if (/^#/.test(v)) return v.slice(0, 500);
        if (/^\.{1,2}\//.test(v) || /^\//.test(v)) return v.slice(0, 500);
        if (/^mailto:[^\s]+$/i.test(v) || /^tel:[^\s]+$/i.test(v)) return v.slice(0, 500);
        try {
            const u = new URL(v, window.location.href);
            if (u.protocol === 'http:' || u.protocol === 'https:') return v.slice(0, 2000);
        } catch (erro) { /* endereço inválido */ }
        return '';
    }

    function urlImagemSegura(valor) {
        const v = String(valor == null ? '' : valor).trim();
        if (!v) return '';
        if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(v)) {
            return v.length <= LIMITES.imagem ? v : '';
        }
        return urlSegura(v);
    }

    function sanitizarHTML(valor) {
        const bruto = String(valor == null ? '' : valor);
        if (!bruto) return '';
        const tpl = document.createElement('template');
        tpl.innerHTML = bruto;
        const saida = document.createElement('div');
        function percorrer(no, destino) {
            if (no.nodeType === 3) {
                destino.appendChild(document.createTextNode(no.nodeValue));
                return;
            }
            if (no.nodeType !== 1) return;
            const tag = no.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed' ||
                tag === 'link' || tag === 'meta' || tag === 'svg' || tag === 'math' || tag === 'template' ||
                tag === 'noscript' || tag === 'form' || tag === 'input' || tag === 'button' || tag === 'textarea' ||
                tag === 'select' || tag === 'option' || tag === 'video' || tag === 'audio' || tag === 'source' ||
                tag === 'canvas' || tag === 'img' || tag === 'picture') {
                return;
            }
            if (!TAGS_PERMITIDAS.has(tag)) {
                Array.prototype.forEach.call(no.childNodes, function (filho) { percorrer(filho, destino); });
                return;
            }
            const el = document.createElement(tag);
            if (tag === 'a') {
                const href = urlSegura(no.getAttribute('href'));
                if (href) el.setAttribute('href', href);
                if (no.getAttribute('target') === '_blank') {
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            }
            Array.prototype.forEach.call(no.childNodes, function (filho) { percorrer(filho, el); });
            destino.appendChild(el);
        }
        Array.prototype.forEach.call(tpl.content.childNodes, function (no) { percorrer(no, saida); });
        return saida.innerHTML.slice(0, LIMITES.html);
    }

    function idUnico(valor, prefixo, usados) {
        let id = String(valor == null ? '' : valor).trim();
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || usados.has(id)) id = uid(prefixo);
        while (usados.has(id)) id = uid(prefixo);
        usados.add(id);
        return id;
    }

    function criarPagina(nome) {
        const titulo = texto(nome, 120).trim() || 'Minha página';
        return {
            id: uid('pg'),
            nome: titulo,
            slug: slugify(titulo),
            seo: { titulo: '', descricao: '' },
            tema: { primaria: '#2563eb', fundo: '#ffffff', texto: '#1e293b', fonte: 'Open Sans', largura: 1080 },
            secoes: [],
            criadoEm: agora(),
            atualizadoEm: agora()
        };
    }

    function criarBloco(tipo, dados) {
        const base = { id: uid('blk'), tipo: tipo };
        const extra = {
            texto: { html: '<p>Escreva seu texto aqui.</p>', alinhamento: 'left' },
            titulo: { texto: 'Novo título', nivel: 'h3', alinhamento: 'left' },
            imagem: { src: '', alt: '', legenda: '', largura: 100, alinhamento: 'center' },
            link: { texto: 'Saiba mais', href: '', novaAba: true, estilo: 'botao', alinhamento: 'left' },
            lista: { html: '<ul><li>Primeiro item</li><li>Segundo item</li></ul>', alinhamento: 'left' },
            citacao: { html: '<p>Uma ideia que merece destaque.</p>', autor: '', alinhamento: 'left' },
            divisor: {},
            espacador: { altura: 32 }
        }[tipo] || {};
        return Object.assign(base, extra, dados || {});
    }

    function criarSecao(preset) {
        const tipo = PRESETS[preset] ? preset : 'conteudo';
        const secao = { id: uid('sec'), titulo: 'Nova seção', subtitulo: '', preset: tipo, ancora: '', blocos: [] };
        if (tipo === 'hero') {
            secao.titulo = 'Um título que resume a página';
            secao.subtitulo = 'Explique em uma frase o que o visitante vai encontrar aqui.';
            secao.blocos = [criarBloco('link', { texto: 'Começar agora', href: '#', estilo: 'botao', alinhamento: 'center' })];
        } else if (tipo === 'destaque') {
            secao.titulo = 'Destaque';
            secao.blocos = [criarBloco('texto', { html: '<p>Use esta faixa para dar ênfase a uma informação importante.</p>' })];
        } else {
            secao.blocos = [criarBloco('texto')];
        }
        return secao;
    }

    function estadoInicial() {
        const pg = criarPagina('Minha página');
        return { versao: VERSAO, atualId: pg.id, paginas: [pg] };
    }

    function normalizarBloco(bruto, usados) {
        if (!bruto || typeof bruto !== 'object') return null;
        const tipo = Object.prototype.hasOwnProperty.call(TIPOS_BLOCO, bruto.tipo) ? bruto.tipo : 'texto';
        const b = criarBloco(tipo);
        b.id = idUnico(bruto.id, 'blk', usados);
        const alinhamento = ['left', 'center', 'right'].indexOf(bruto.alinhamento) >= 0 ? bruto.alinhamento : 'left';
        if (tipo === 'texto' || tipo === 'lista' || tipo === 'citacao') {
            b.html = sanitizarHTML(bruto.html);
            b.alinhamento = alinhamento;
            if (tipo === 'citacao') b.autor = texto(bruto.autor, 160);
            if (tipo === 'lista' && !b.html) b.html = '<ul><li>Novo item</li></ul>';
        } else if (tipo === 'titulo') {
            b.texto = texto(bruto.texto, 500) || 'Novo título';
            b.nivel = ['h2', 'h3', 'h4'].indexOf(bruto.nivel) >= 0 ? bruto.nivel : 'h3';
            b.alinhamento = alinhamento;
        } else if (tipo === 'imagem') {
            b.src = urlImagemSegura(bruto.src);
            b.alt = texto(bruto.alt, 300);
            b.legenda = texto(bruto.legenda, 300);
            b.largura = Math.min(100, Math.max(15, parseInt(bruto.largura, 10) || 100));
            b.alinhamento = alinhamento;
        } else if (tipo === 'link') {
            b.texto = texto(bruto.texto, 200) || 'Saiba mais';
            b.href = urlSegura(bruto.href);
            b.novaAba = bruto.novaAba !== false;
            b.estilo = bruto.estilo === 'link' ? 'link' : 'botao';
            b.alinhamento = alinhamento;
        } else if (tipo === 'espacador') {
            b.altura = Math.min(200, Math.max(8, parseInt(bruto.altura, 10) || 32));
        }
        return b;
    }

    function normalizarSecao(bruto, usadosSecoes) {
        if (!bruto || typeof bruto !== 'object') return null;
        const secao = criarSecao(PRESETS[bruto.preset] ? bruto.preset : 'conteudo');
        secao.id = idUnico(bruto.id, 'sec', usadosSecoes);
        secao.titulo = texto(bruto.titulo, 200);
        secao.subtitulo = texto(bruto.subtitulo, 400);
        secao.preset = PRESETS[bruto.preset] ? bruto.preset : 'conteudo';
        secao.ancora = slugify(bruto.ancora || '');
        if (secao.ancora === 'pagina') secao.ancora = '';
        secao.blocos = [];
        const usadosBlocos = new Set();
        if (Array.isArray(bruto.blocos)) {
            bruto.blocos.slice(0, LIMITES.blocos).forEach(function (b) {
                const nb = normalizarBloco(b, usadosBlocos);
                if (nb) secao.blocos.push(nb);
            });
        }
        return secao;
    }

    function normalizarPagina(bruto, usadosPaginas) {
        if (!bruto || typeof bruto !== 'object') return null;
        const padrao = criarPagina(bruto.nome);
        const pg = {
            id: idUnico(bruto.id, 'pg', usadosPaginas),
            nome: texto(bruto.nome, 120).trim() || padrao.nome,
            slug: slugify(bruto.slug || bruto.nome || padrao.nome),
            seo: {
                titulo: texto(bruto.seo && bruto.seo.titulo, 160),
                descricao: texto(bruto.seo && bruto.seo.descricao, 320)
            },
            tema: {
                primaria: cor(bruto.tema && bruto.tema.primaria, '#2563eb'),
                fundo: cor(bruto.tema && bruto.tema.fundo, '#ffffff'),
                texto: cor(bruto.tema && bruto.tema.texto, '#1e293b'),
                fonte: fonteValida(bruto.tema && bruto.tema.fonte),
                largura: Math.min(1600, Math.max(640, parseInt(bruto.tema && bruto.tema.largura, 10) || 1080))
            },
            secoes: [],
            criadoEm: texto(bruto.criadoEm, 40) || agora(),
            atualizadoEm: agora()
        };
        const usadosSecoes = new Set();
        if (Array.isArray(bruto.secoes)) {
            bruto.secoes.slice(0, LIMITES.secoes).forEach(function (s) {
                const ns = normalizarSecao(s, usadosSecoes);
                if (ns) pg.secoes.push(ns);
            });
        }
        return pg;
    }

    function normalizarProjeto(bruto) {
        if (!bruto || typeof bruto !== 'object') return null;
        let lista = Array.isArray(bruto.paginas) ? bruto.paginas : null;
        if (!lista && bruto.estado && Array.isArray(bruto.estado.paginas)) lista = bruto.estado.paginas;
        if (!lista || !lista.length) return null;
        const usadosPaginas = new Set();
        const paginas = [];
        lista.slice(0, LIMITES.paginas).forEach(function (p) {
            const np = normalizarPagina(p, usadosPaginas);
            if (np) paginas.push(np);
        });
        if (!paginas.length) return null;
        const atual = paginas.some(function (p) { return p.id === bruto.atualId; }) ? bruto.atualId : paginas[0].id;
        return { versao: VERSAO, atualId: atual, paginas: paginas };
    }


    function paginaAtual() {
        if (!estado) return null;
        return estado.paginas.find(function (p) { return p.id === estado.atualId; }) || estado.paginas[0] || null;
    }

    function secaoAtual() {
        const pg = paginaAtual();
        if (!pg) return null;
        if (selecao.tipo === 'secao') return pg.secoes.find(function (s) { return s.id === selecao.id; }) || null;
        if (selecao.tipo === 'bloco') {
            for (let i = 0; i < pg.secoes.length; i += 1) {
                if (pg.secoes[i].blocos.some(function (b) { return b.id === selecao.id; })) return pg.secoes[i];
            }
        }
        return null;
    }

    function blocoAtual() {
        const sec = secaoAtual();
        if (!sec || selecao.tipo !== 'bloco') return null;
        return sec.blocos.find(function (b) { return b.id === selecao.id; }) || null;
    }

    function acharBloco(id) {
        const pg = paginaAtual();
        if (!pg) return null;
        for (let i = 0; i < pg.secoes.length; i += 1) {
            const b = pg.secoes[i].blocos.find(function (x) { return x.id === id; });
            if (b) return b;
        }
        return null;
    }

    function acharSecaoDoBloco(id) {
        const pg = paginaAtual();
        if (!pg) return null;
        return pg.secoes.find(function (s) {
            return s.blocos.some(function (b) { return b.id === id; });
        }) || null;
    }

    function snapshot() { return JSON.stringify(estado); }

    const MAX_HISTORICO_BYTES = 24 * 1024 * 1024;

    function apararHistorico() {
        let total = 0;
        for (let i = historico.length - 1; i >= 0; i -= 1) {
            total += historico[i].length * 2;
            if (total > MAX_HISTORICO_BYTES && i > 0) {
                historico.splice(0, i);
                return;
            }
        }
    }

    function empurrarHistorico(json) {
        if (!json) return;
        if (historico[historico.length - 1] === json) return;
        historico.push(json);
        if (historico.length > MAX_HISTORICO) historico.shift();
        apararHistorico();
        refazerPilha = [];
        atualizarBotoesHist();
    }

    function flushEdicao() {
        if (antesEdicao === null) return;
        const atual = snapshot();
        if (atual !== antesEdicao) empurrarHistorico(antesEdicao);
        antesEdicao = null;
    }

    function pushHistorico() {
        flushEdicao();
        empurrarHistorico(snapshot());
    }

    function desfazer() {
        if (!historico.length) return;
        refazerPilha.push(snapshot());
        estado = JSON.parse(historico.pop());
        selecao = { tipo: 'pagina', id: null };
        marcarSujo();
        renderTudo();
    }

    function refazer() {
        if (!refazerPilha.length) return;
        historico.push(snapshot());
        estado = JSON.parse(refazerPilha.pop());
        selecao = { tipo: 'pagina', id: null };
        marcarSujo();
        renderTudo();
    }

    function atualizarBotoesHist() {
        if (refs.undo) refs.undo.disabled = historico.length === 0;
        if (refs.redo) refs.redo.disabled = refazerPilha.length === 0;
    }

    function atualizarStatus() {
        if (!refs.status) return;
        if (sujo) {
            refs.status.dataset.estado = 'sujo';
            refs.status.textContent = 'Alterações não salvas';
            return;
        }
        refs.status.dataset.estado = 'salvo';
        if (ultimoSalvoEm) {
            const h = String(ultimoSalvoEm.getHours()).padStart(2, '0');
            const m = String(ultimoSalvoEm.getMinutes()).padStart(2, '0');
            refs.status.textContent = 'Salvo às ' + h + ':' + m;
        } else {
            refs.status.textContent = 'Salvo';
        }
    }

    function marcarSujo() {
        sujo = true;
        atualizarStatus();
        clearTimeout(timerAuto);
        timerAuto = setTimeout(function () { salvarLocal(true); }, 900);
    }

    function notificarErroSalvar(erro) {
        const quota = erro && (erro.name === 'QuotaExceededError' || erro.code === 22 || erro.code === 1014);
        if (refs.status) {
            refs.status.dataset.estado = 'erro';
            refs.status.textContent = quota ? 'Armazenamento cheio' : 'Falha ao salvar';
        }
        toast(quota
            ? 'O navegador ficou sem espaço. Exporte o projeto em JSON e remova imagens grandes antes de continuar.'
            : 'Não foi possível salvar neste navegador. Exporte o projeto em JSON para não perder o trabalho.', 'erro', 7000);
    }

    function salvarLocal(silencioso) {
        if (!estado) return false;
        try {
            const json = JSON.stringify(estado);
            const anterior = localStorage.getItem(LS_KEY);
            if (anterior && anterior !== json) localStorage.setItem(LS_BACKUP, anterior);
            localStorage.setItem(LS_KEY, json);
            sujo = false;
            ultimoSalvoEm = new Date();
            atualizarStatus();
            atualizarBackup();
            if (!silencioso) toast('Projeto salvo neste navegador.', 'ok');
            return true;
        } catch (erro) {
            notificarErroSalvar(erro);
            return false;
        }
    }

    function carregarProjeto() {
        let bruto = null;
        try { bruto = localStorage.getItem(LS_KEY); } catch (erro) { bruto = null; }
        if (!bruto) { estado = estadoInicial(); ultimoSalvoEm = new Date(); return; }
        try {
            const valido = normalizarProjeto(JSON.parse(bruto));
            if (!valido) throw new Error('Formato inválido');
            estado = valido;
            ultimoSalvoEm = new Date();
        } catch (erro) {
            try { localStorage.setItem(LS_KEY + '_corrompido_' + Date.now(), bruto); } catch (e) { /* sem espaço */ }
            estado = estadoInicial();
            ultimoSalvoEm = new Date();
            setTimeout(function () {
                toast('O projeto salvo estava corrompido. Uma cópia foi preservada e um novo projeto foi aberto.', 'erro', 7000);
            }, 500);
        }
    }

    function atualizarBackup() {
        if (!refs.btnBackup) return;
        let tem = false;
        try { tem = !!localStorage.getItem(LS_BACKUP); } catch (erro) { tem = false; }
        refs.btnBackup.disabled = !tem;
        refs.btnBackup.title = tem ? 'Restaurar a versão anterior do projeto' : 'Nenhuma versão anterior disponível';
    }

    function restaurarBackup() {
        let bruto = null;
        try { bruto = localStorage.getItem(LS_BACKUP); } catch (erro) { bruto = null; }
        if (!bruto) { toast('Não há versão anterior salva.', 'aviso'); return; }
        let valido = null;
        try { valido = normalizarProjeto(JSON.parse(bruto)); } catch (erro) { valido = null; }
        if (!valido) { toast('A versão anterior está inválida e não pode ser restaurada.', 'erro'); return; }
        abrirModal({
            titulo: 'Restaurar versão anterior?',
            texto: 'O projeto atual será substituído pela última versão guardada antes do salvamento mais recente. Você ainda poderá desfazer.',
            ok: 'Restaurar', perigo: true
        }).then(function (ok) {
            if (!ok) return;
            pushHistorico();
            estado = valido;
            selecao = { tipo: 'pagina', id: null };
            marcarSujo();
            salvarLocal(true);
            renderTudo();
            toast('Versão anterior restaurada.', 'ok');
        });
    }

    function toast(mensagem, tipo, duracao) {
        if (!refs.toasts) return;
        const el = document.createElement('div');
        el.className = 'apb-toast';
        el.dataset.tipo = tipo || 'ok';
        el.setAttribute('role', 'status');
        el.textContent = mensagem;
        refs.toasts.appendChild(el);
        setTimeout(function () {
            el.style.opacity = '0';
            el.style.transition = 'opacity .2s';
            setTimeout(function () { el.remove(); }, 220);
        }, duracao || 3800);
    }

    function abrirModal(opcoes) {
        const cfg = opcoes || {};
        if (!refs.modal) return Promise.resolve(null);
        return new Promise(function (resolve) {
            modalResolver = resolve;
            refs.modalTitle.textContent = cfg.titulo || 'Confirmar';
            refs.modalText.textContent = cfg.texto || '';
            refs.modalInput.hidden = !cfg.input;
            refs.modalInput.value = cfg.valor || '';
            refs.modalInput.type = cfg.tipoInput || 'text';
            refs.modalOk.textContent = cfg.ok || 'Confirmar';
            refs.modalOk.className = 'apb-btn ' + (cfg.perigo ? 'apb-btn--danger' : 'apb-btn--primary');
            refs.modalCancel.hidden = !!cfg.ocultarCancelar;
            refs.modal.classList.add('apb-aberto');
            setTimeout(function () {
                if (cfg.input) {
                    refs.modalInput.focus();
                    refs.modalInput.select();
                } else {
                    refs.modalOk.focus();
                }
            }, 30);
        });
    }

    function fecharModal(valor) {
        if (!refs.modal) return;
        refs.modal.classList.remove('apb-aberto');
        const resolver = modalResolver;
        modalResolver = null;
        if (resolver) resolver(valor);
    }

    function confirmar(titulo, texto, ok, perigo) {
        return abrirModal({ titulo: titulo, texto: texto, ok: ok || 'Confirmar', perigo: !!perigo });
    }

    function prompt(titulo, texto, valor, ok) {
        return abrirModal({ titulo: titulo, texto: texto, valor: valor || '', input: true, ok: ok || 'Criar' });
    }


    function montarUI() {
        const html = `
<div id="apbRoot" aria-hidden="true">
  <div class="apb-shell">
    <header class="apb-topbar">
      <div class="apb-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M9 21V9"></path></svg>
        <span>Construtor<small>Editor visual de páginas</small></span>
      </div>
      <button class="apb-btn apb-btn--ghost apb-mobile-only" id="apbToggleLeft" type="button" aria-label="Mostrar páginas e seções">☰</button>
      <div class="apb-page-switcher">
        <select id="apbPageSelect" aria-label="Página em edição"></select>
        <button class="apb-icon-btn" id="apbNewPageTop" type="button" title="Nova página" aria-label="Nova página">+</button>
      </div>
      <div class="apb-top-actions">
        <span class="apb-status" id="apbStatus" data-estado="salvo" aria-live="polite">Salvo</span>
        <button class="apb-icon-btn" id="apbUndo" type="button" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled>↶</button>
        <button class="apb-icon-btn" id="apbRedo" type="button" title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled>↷</button>
        <button class="apb-btn apb-btn--ghost" id="apbHelp" type="button" title="Ajuda" aria-label="Ajuda">?</button>
        <button class="apb-btn apb-btn--ghost" id="apbPreview" type="button" title="Ver a página sem controles de edição">Prévia</button>
        <div class="apb-menu-wrap">
          <button class="apb-btn apb-btn--primary" id="apbExportBtn" type="button" aria-haspopup="true" aria-expanded="false">Exportar</button>
          <div class="apb-menu" id="apbExportMenu" role="menu">
            <button type="button" data-apb-export="pagina" role="menuitem"><strong>Página atual (HTML)</strong><small>Arquivo único, seguro e pronto para publicar.</small></button>
            <button type="button" data-apb-export="site" role="menuitem"><strong>Site completo (ZIP)</strong><small>Todas as páginas em HTML e o projeto em JSON.</small></button>
            <hr>
            <button type="button" data-apb-export="json" role="menuitem"><strong>Projeto (JSON)</strong><small>Backup editável de todas as páginas.</small></button>
            <button type="button" data-apb-export="importar" role="menuitem"><strong>Importar projeto (JSON)</strong><small>Abrir um backup salvo anteriormente.</small></button>
          </div>
        </div>
        <button class="apb-icon-btn apb-mobile-only" id="apbToggleRight" type="button" title="Mostrar propriedades" aria-label="Mostrar propriedades">⚙</button>
        <button class="apb-btn apb-btn--ghost" id="apbClose" type="button" title="Fechar o construtor">Fechar</button>
      </div>
    </header>
    <div class="apb-body">
      <aside class="apb-left" aria-label="Páginas e seções">
        <div class="apb-panel-head"><span>Páginas</span><button class="apb-btn apb-btn--sm" id="apbNewPage" type="button">+ Nova</button></div>
        <ul class="apb-list" id="apbPagesList"></ul>
        <div class="apb-panel-head"><span>Seções</span><button class="apb-btn apb-btn--sm" id="apbAddSection" type="button">+ Seção</button></div>
        <ul class="apb-list" id="apbSectionsList"></ul>
        <div class="apb-panel-foot">
          <button class="apb-btn apb-btn--sm" id="apbBackup" type="button" disabled>Restaurar versão anterior</button>
          <button class="apb-btn apb-btn--sm apb-btn--danger" id="apbNovoProjeto" type="button">Novo projeto</button>
          <p>Salvo automaticamente neste navegador. Para guardar fora dele, use <strong>Exportar → Projeto (JSON)</strong>.</p>
        </div>
      </aside>
      <main class="apb-canvas-wrap" id="apbCanvasWrap">
        <div class="apb-insertbar" role="toolbar" aria-label="Inserir blocos">
          <span class="apb-insert-label">Inserir</span>
          <button class="apb-btn" type="button" data-apb-add="texto">Texto</button>
          <button class="apb-btn" type="button" data-apb-add="titulo">Título</button>
          <button class="apb-btn" type="button" data-apb-add="imagem">Imagem</button>
          <button class="apb-btn" type="button" data-apb-add="link">Link</button>
          <button class="apb-btn" type="button" data-apb-add="lista">Lista</button>
          <button class="apb-btn" type="button" data-apb-add="citacao">Citação</button>
          <button class="apb-btn" type="button" data-apb-add="divisor">Divisor</button>
          <button class="apb-btn" type="button" data-apb-add="espacador">Espaço</button>
          <span class="apb-insert-spacer"></span>
          <button class="apb-btn apb-btn--primary" type="button" data-apb-add-secao="conteudo">+ Seção</button>
        </div>
        <div class="apb-preview-bar"><span>Prévia da página — os controles de edição estão ocultos.</span><span class="apb-insert-spacer"></span><button class="apb-btn apb-btn--sm" id="apbSairPrevia" type="button">Voltar a editar</button></div>
        <div class="apb-canvas" id="apbCanvas"></div>
      </main>
      <aside class="apb-right" aria-label="Propriedades"><div class="apb-insp" id="apbInspector"></div></aside>
    </div>
    <div class="apb-fmtbar" id="apbFmtbar" role="toolbar" aria-label="Formatação de texto">
      <button type="button" data-cmd="bold" title="Negrito (Ctrl+B)">B</button>
      <button type="button" data-cmd="italic" title="Itálico (Ctrl+I)"><em>I</em></button>
      <button type="button" data-cmd="underline" title="Sublinhado (Ctrl+U)"><u>U</u></button>
      <button type="button" data-cmd="strikeThrough" title="Tachado">S</button>
      <span class="apb-fmt-sep"></span>
      <button type="button" data-cmd="h2" title="Título grande">H2</button>
      <button type="button" data-cmd="h3" title="Título médio">H3</button>
      <button type="button" data-cmd="p" title="Parágrafo">¶</button>
      <span class="apb-fmt-sep"></span>
      <button type="button" data-cmd="insertUnorderedList" title="Lista com marcadores">•</button>
      <button type="button" data-cmd="insertOrderedList" title="Lista numerada">1.</button>
      <button type="button" data-cmd="createLink" title="Inserir link">🔗</button>
      <button type="button" data-cmd="unlink" title="Remover link">⛓</button>
      <button type="button" data-cmd="removeFormat" title="Limpar formatação">⌫</button>
    </div>
    <input type="file" id="apbImgInput" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
    <input type="file" id="apbJsonInput" accept="application/json,.json" hidden>
    <div class="apb-modal" id="apbModal" role="dialog" aria-modal="true" aria-labelledby="apbModalTitle">
      <div class="apb-modal-card">
        <h3 id="apbModalTitle"></h3>
        <p id="apbModalText"></p>
        <input class="apb-input" id="apbModalInput" type="text" hidden>
        <div class="apb-modal-actions">
          <button class="apb-btn" id="apbModalCancel" type="button">Cancelar</button>
          <button class="apb-btn apb-btn--primary" id="apbModalOk" type="button">Confirmar</button>
        </div>
      </div>
    </div>
    <div class="apb-toasts" id="apbToasts" aria-live="polite"></div>
  </div>
</div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        refs = {
            root: document.getElementById('apbRoot'),
            pageSelect: document.getElementById('apbPageSelect'),
            pagesList: document.getElementById('apbPagesList'),
            sectionsList: document.getElementById('apbSectionsList'),
            status: document.getElementById('apbStatus'),
            undo: document.getElementById('apbUndo'),
            redo: document.getElementById('apbRedo'),
            canvasWrap: document.getElementById('apbCanvasWrap'),
            canvas: document.getElementById('apbCanvas'),
            inspector: document.getElementById('apbInspector'),
            fmtbar: document.getElementById('apbFmtbar'),
            exportMenu: document.getElementById('apbExportMenu'),
            exportBtn: document.getElementById('apbExportBtn'),
            imgInput: document.getElementById('apbImgInput'),
            jsonInput: document.getElementById('apbJsonInput'),
            modal: document.getElementById('apbModal'),
            modalTitle: document.getElementById('apbModalTitle'),
            modalText: document.getElementById('apbModalText'),
            modalInput: document.getElementById('apbModalInput'),
            modalOk: document.getElementById('apbModalOk'),
            modalCancel: document.getElementById('apbModalCancel'),
            toasts: document.getElementById('apbToasts'),
            btnBackup: document.getElementById('apbBackup')
        };
    }

    function injetarBotaoNav() {
        const acoes = document.querySelector('.nav-actions');
        if (!acoes || document.getElementById('apbAbrirBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'apbAbrirBtn';
        btn.type = 'button';
        btn.className = 'btn-custom btn-custom-outline apb-nav-btn';
        btn.textContent = 'Construtor';
        btn.title = 'Abrir o construtor de páginas';
        btn.setAttribute('aria-label', 'Abrir o construtor de páginas');
        btn.addEventListener('click', abrir);
        acoes.insertBefore(btn, acoes.firstChild);
    }

    function abrir() {
        if (!refs.root) return;
        if (aberto) return;
        aberto = true;
        previa = false;
        refs.root.classList.add('apb-open');
        refs.root.classList.remove('apb-preview');
        refs.root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('apb-lock');
        atualizarBackup();
        renderTudo();
        setTimeout(function () {
            const fechar = document.getElementById('apbClose');
            if (fechar) fechar.focus({ preventScroll: true });
        }, 60);
    }

    function fechar() {
        if (!refs.root || !aberto) return;
        if (previa) sairDaPrevia();
        flushEdicao();
        flushInsp();
        if (sujo) salvarLocal(true);
        aberto = false;
        esconderMenuExport();
        esconderFmtbar();
        fecharModal(null);
        refs.root.classList.remove('apb-open', 'apb-show-left', 'apb-show-right');
        refs.root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('apb-lock');
    }

    function alternarPrevia() {
        previa = !previa;
        refs.root.classList.toggle('apb-preview', previa);
        aplicarEditabilidade();
        if (previa) refs.canvasWrap.scrollTop = 0;
        esconderFmtbar();
    }

    function sairDaPrevia() {
        if (!previa) return;
        previa = false;
        refs.root.classList.remove('apb-preview');
        aplicarEditabilidade();
    }

    function aplicarEditabilidade() {
        if (!refs.canvas) return;
        Array.prototype.forEach.call(refs.canvas.querySelectorAll('[data-apb-field], [data-apb-sec-field]'), function (el) {
            el.setAttribute('contenteditable', previa ? 'false' : 'true');
        });
    }


    function garantirSelecaoValida() {
        if (!estado) estado = estadoInicial();
        if (!Array.isArray(estado.paginas) || !estado.paginas.length) {
            const pg = criarPagina('Minha página');
            estado.paginas = [pg];
            estado.atualId = pg.id;
        }
        const pg = paginaAtual();
        if (!pg) estado.atualId = estado.paginas[0].id;
        if (selecao.tipo === 'bloco' && !acharBloco(selecao.id)) selecao = { tipo: 'pagina', id: null };
        if (selecao.tipo === 'secao' && !paginaAtual().secoes.some(function (s) { return s.id === selecao.id; })) {
            selecao = { tipo: 'pagina', id: null };
        }
    }

    function renderTudo() {
        if (!refs.root) return;
        const y = refs.canvasWrap ? refs.canvasWrap.scrollTop : 0;
        garantirSelecaoValida();
        renderPageSelect();
        renderPagesList();
        renderSectionsList();
        renderCanvas();
        renderInspector();
        atualizarBotoesHist();
        atualizarStatus();
        atualizarBackup();
        if (refs.canvasWrap) refs.canvasWrap.scrollTop = y;
    }

    function renderPageSelect() {
        if (!refs.pageSelect) return;
        refs.pageSelect.innerHTML = estado.paginas.map(function (p) {
            return '<option value="' + esc(p.id) + '">' + esc(p.nome) + '</option>';
        }).join('');
        refs.pageSelect.value = estado.atualId;
    }

    function renderPagesList() {
        if (!refs.pagesList) return;
        refs.pagesList.innerHTML = estado.paginas.map(function (p) {
            const ativo = p.id === estado.atualId ? ' apb-ativo' : '';
            return '<li class="apb-list-item' + ativo + '" data-apb-pagina="' + esc(p.id) + '" role="button" tabindex="0">' +
                '<div class="apb-li-main"><span class="apb-li-name">' + esc(p.nome) + '</span>' +
                '<span class="apb-li-sub">' + p.secoes.length + ' seção(ões) · ' + esc(p.slug) + '.html</span></div>' +
                '<div class="apb-li-actions">' +
                '<button class="apb-mini" type="button" data-apb-pagina-acao="dup" title="Duplicar página" aria-label="Duplicar página">⧉</button>' +
                '<button class="apb-mini" type="button" data-apb-pagina-acao="del" title="Excluir página" aria-label="Excluir página" data-perigo>×</button>' +
                '</div></li>';
        }).join('');
    }

    function renderSectionsList() {
        if (!refs.sectionsList) return;
        const pg = paginaAtual();
        if (!pg || !pg.secoes.length) {
            refs.sectionsList.innerHTML = '<li class="apb-vazio">Nenhuma seção ainda. Use “+ Seção”.</li>';
            return;
        }
        refs.sectionsList.innerHTML = pg.secoes.map(function (s, i) {
            const ativo = (selecao.tipo === 'secao' && selecao.id === s.id) ? ' apb-ativo' : '';
            const nome = s.titulo ? s.titulo : 'Seção ' + (i + 1);
            return '<li class="apb-list-item' + ativo + '" data-apb-secao-item="' + esc(s.id) + '" role="button" tabindex="0">' +
                '<div class="apb-li-main"><span class="apb-li-name">' + (i + 1) + '. ' + esc(nome) + '</span>' +
                '<span class="apb-li-sub">' + (PRESETS[s.preset] ? PRESETS[s.preset].nome : 'Seção') + ' · ' + s.blocos.length + ' bloco(s)</span></div>' +
                '<div class="apb-li-actions">' +
                '<button class="apb-mini" type="button" data-apb-secao-acao="up" title="Mover para cima" aria-label="Mover seção para cima">↑</button>' +
                '<button class="apb-mini" type="button" data-apb-secao-acao="down" title="Mover para baixo" aria-label="Mover seção para baixo">↓</button>' +
                '<button class="apb-mini" type="button" data-apb-secao-acao="dup" title="Duplicar seção" aria-label="Duplicar seção">⧉</button>' +
                '<button class="apb-mini" type="button" data-apb-secao-acao="del" title="Excluir seção" aria-label="Excluir seção" data-perigo>×</button>' +
                '</div></li>';
        }).join('');
    }

    function ferramentasSecao() {
        return '<div class="apb-sec-tools" role="toolbar" aria-label="Ações da seção">' +
            '<button class="apb-mini" type="button" data-apb-sec-action="up" title="Mover seção para cima">↑</button>' +
            '<button class="apb-mini" type="button" data-apb-sec-action="down" title="Mover seção para baixo">↓</button>' +
            '<button class="apb-mini" type="button" data-apb-sec-action="dup" title="Duplicar seção">⧉</button>' +
            '<button class="apb-mini" type="button" data-apb-sec-action="del" title="Excluir seção" data-perigo>×</button>' +
            '</div>';
    }

    function ferramentasBloco() {
        return '<div class="apb-block-tools" role="toolbar" aria-label="Ações do bloco">' +
            '<button class="apb-mini" type="button" data-apb-block-action="up" title="Mover bloco para cima">↑</button>' +
            '<button class="apb-mini" type="button" data-apb-block-action="down" title="Mover bloco para baixo">↓</button>' +
            '<button class="apb-mini" type="button" data-apb-block-action="dup" title="Duplicar bloco">⧉</button>' +
            '<button class="apb-mini" type="button" data-apb-block-action="del" title="Excluir bloco" data-perigo>×</button>' +
            '</div>';
    }

    function renderSecao(sec) {
        const el = document.createElement('section');
        el.className = 'apb-sec apb-sec--' + sec.preset;
        el.dataset.apbSec = sec.id;
        if (selecao.tipo === 'secao' && selecao.id === sec.id) el.classList.add('apb-selecionada');
        el.innerHTML = ferramentasSecao() +
            '<div class="apb-sec-head">' +
            '<h2 class="apb-sec-title" data-apb-sec-field="titulo" data-single-line="1" data-placeholder="Título da seção"></h2>' +
            '<p class="apb-sec-subtitle" data-apb-sec-field="subtitulo" data-single-line="1" data-placeholder="Subtítulo (opcional)"></p>' +
            '</div><div class="apb-blocks"></div>' +
            '<button class="apb-add-block" type="button" data-apb-add-block="texto">+ Adicionar bloco</button>';
        const titulo = el.querySelector('.apb-sec-title');
        const subtitulo = el.querySelector('.apb-sec-subtitle');
        titulo.textContent = sec.titulo;
        subtitulo.textContent = sec.subtitulo;
        const cont = el.querySelector('.apb-blocks');
        sec.blocos.forEach(function (b) { cont.appendChild(renderBloco(b)); });
        return el;
    }

    function renderBloco(b) {
        const el = document.createElement('div');
        el.className = 'apb-block apb-block--' + b.tipo;
        el.dataset.apbBlock = b.id;
        el.dataset.alinhamento = b.alinhamento || 'left';
        if (selecao.tipo === 'bloco' && selecao.id === b.id) el.classList.add('apb-selecionado');
        let conteudo = '';
        if (b.tipo === 'texto') {
            conteudo = '<div class="apb-rich" data-apb-field="html" data-placeholder="Escreva seu texto...">' + sanitizarHTML(b.html) + '</div>';
        } else if (b.tipo === 'lista') {
            conteudo = '<div class="apb-rich" data-apb-field="html" data-placeholder="Itens da lista...">' + sanitizarHTML(b.html || '<ul><li>Novo item</li></ul>') + '</div>';
        } else if (b.tipo === 'citacao') {
            conteudo = '<blockquote class="apb-rich" data-apb-field="html">' + sanitizarHTML(b.html) + '</blockquote>' +
                '<footer class="apb-rich" data-apb-field="autor" data-single-line="1" data-placeholder="Autor (opcional)" style="font-size:12px;opacity:.7;margin-top:6px;text-align:right">' + esc(b.autor || '') + '</footer>';
        } else if (b.tipo === 'titulo') {
            const nivel = ['h2', 'h3', 'h4'].indexOf(b.nivel) >= 0 ? b.nivel : 'h3';
            conteudo = '<' + nivel + ' data-apb-field="texto" data-single-line="1">' + esc(b.texto) + '</' + nivel + '>';
        } else if (b.tipo === 'imagem') {
            if (b.src) {
                conteudo = '<figure><img src="' + esc(b.src) + '" alt="' + esc(b.alt) + '" loading="lazy" style="width:' + b.largura + '%">' +
                    '<figcaption data-apb-field="legenda" data-single-line="1" data-placeholder="Legenda (opcional)">' + esc(b.legenda) + '</figcaption></figure>';
            } else {
                conteudo = '<div class="apb-img-placeholder"><span>Nenhuma imagem selecionada.</span>' +
                    '<button class="apb-btn apb-btn--sm" type="button" data-apb-img-escolher="1">Escolher imagem</button></div>';
            }
        } else if (b.tipo === 'link') {
            const classe = b.estilo === 'link' ? 'apb-link' : 'apb-link apb-link--botao';
            const href = urlSegura(b.href) || '#';
            const alvo = b.novaAba ? ' target="_blank" rel="noopener noreferrer"' : '';
            conteudo = '<a class="' + classe + '" href="' + esc(href) + '"' + alvo + ' data-apb-field="texto" data-single-line="1">' + esc(b.texto) + '</a>';
        } else if (b.tipo === 'divisor') {
            conteudo = '<hr>';
        } else if (b.tipo === 'espacador') {
            conteudo = '<div style="height:' + b.altura + 'px"></div>';
        }
        el.innerHTML = conteudo + ferramentasBloco();
        return el;
    }

    function estadoVazioHTML() {
        return '<div class="apb-empty">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"></path><path d="M4 9h16"></path><path d="M9 21V9"></path></svg>' +
            '<h3>Página vazia</h3>' +
            '<p>Comece adicionando uma seção. Você poderá incluir textos, imagens, listas, links e botões.</p>' +
            '<button class="apb-btn apb-btn--primary" type="button" data-apb-add-secao="conteudo">Adicionar primeira seção</button>' +
            '<button class="apb-btn" type="button" data-apb-add-secao="hero">Começar com um destaque</button>' +
            '</div>';
    }

    function renderCanvas() {
        if (!refs.canvas) return;
        const pg = paginaAtual();
        const page = document.createElement('div');
        page.className = 'apb-page';
        page.dataset.pageId = pg.id;
        const inner = document.createElement('div');
        inner.className = 'apb-page-inner';
        if (!pg.secoes.length) {
            inner.innerHTML = estadoVazioHTML();
        } else {
            pg.secoes.forEach(function (s) { inner.appendChild(renderSecao(s)); });
        }
        page.appendChild(inner);
        refs.canvas.innerHTML = '';
        refs.canvas.appendChild(page);
        aplicarTemaCanvas();
        aplicarEditabilidade();
    }

    function aplicarTemaCanvas() {
        const pg = paginaAtual();
        const page = refs.canvas ? refs.canvas.querySelector('.apb-page') : null;
        if (!pg || !page) return;
        page.style.setProperty('--page-primary', pg.tema.primaria);
        page.style.setProperty('--page-bg', pg.tema.fundo);
        page.style.setProperty('--page-fg', pg.tema.texto);
        page.style.setProperty('--page-soft', corRgba(pg.tema.primaria, 0.09));
        page.style.setProperty('--page-max', pg.tema.largura + 'px');
        page.style.fontFamily = FONTES[pg.tema.fonte].stack;
    }

    function atualizarSelecaoVisual() {
        if (!refs.canvas) return;
        Array.prototype.forEach.call(refs.canvas.querySelectorAll('.apb-sec'), function (s) {
            s.classList.toggle('apb-selecionada', selecao.tipo === 'secao' && s.dataset.apbSec === selecao.id);
        });
        Array.prototype.forEach.call(refs.canvas.querySelectorAll('.apb-block'), function (b) {
            b.classList.toggle('apb-selecionado', selecao.tipo === 'bloco' && b.dataset.apbBlock === selecao.id);
        });
    }

    function selecionar(tipo, id) {
        selecao = { tipo: tipo, id: tipo === 'pagina' ? null : id };
        atualizarSelecaoVisual();
        renderSectionsList();
        renderInspector();
    }

    function rolarParaSelecao() {
        requestAnimationFrame(function () {
            let alvo = null;
            if (selecao.tipo === 'bloco') alvo = refs.canvas.querySelector('[data-apb-block="' + selecao.id + '"]');
            else if (selecao.tipo === 'secao') alvo = refs.canvas.querySelector('[data-apb-sec="' + selecao.id + '"]');
            if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    function atualizarTituloDaSecaoNaLista(id) {
        const pg = paginaAtual();
        const sec = pg ? pg.secoes.find(function (s) { return s.id === id; }) : null;
        if (!sec) return;
        const item = refs.sectionsList ? refs.sectionsList.querySelector('[data-apb-secao-item="' + id + '"] .apb-li-name') : null;
        if (item) {
            const i = pg.secoes.indexOf(sec);
            item.textContent = (i + 1) + '. ' + (sec.titulo || 'Seção ' + (i + 1));
        }
    }


    function campo(label, prop, valor, opcoes) {
        const opts = opcoes || {};
        const id = 'apb_f_' + prop.replace(/[^a-z0-9_]/gi, '');
        let controle = '';
        if (opts.tipo === 'textarea') {
            controle = '<textarea class="apb-textarea" id="' + id + '" data-apb-prop="' + prop + '" rows="' + (opts.rows || 3) + '" placeholder="' + esc(opts.placeholder || '') + '">' + esc(valor) + '</textarea>';
        } else if (opts.tipo === 'select') {
            controle = '<select class="apb-select" id="' + id + '" data-apb-prop="' + prop + '">' +
                (opts.opcoes || []).map(function (o) {
                    return '<option value="' + esc(o.v) + '"' + (o.v === valor ? ' selected' : '') + '>' + esc(o.l) + '</option>';
                }).join('') + '</select>';
        } else if (opts.tipo === 'checkbox') {
            return '<label class="apb-check"><input type="checkbox" data-apb-prop="' + prop + '"' + (valor ? ' checked' : '') + '> ' + esc(label) + '</label>';
        } else if (opts.tipo === 'range') {
            controle = '<div class="apb-range-row"><input type="range" id="' + id + '" data-apb-prop="' + prop + '" min="' + (opts.min || 0) + '" max="' + (opts.max || 100) + '" step="' + (opts.step || 1) + '" value="' + esc(valor) + '">' +
                '<output id="' + id + '_out">' + esc(valor) + (opts.sufixo || '') + '</output></div>';
        } else if (opts.tipo === 'color') {
            const swatches = (opts.cores || CORES_RAPIDAS).map(function (c) {
                return '<button class="apb-swatch" type="button" data-apb-swatch="' + esc(c) + '" data-apb-swatch-prop="' + prop + '" style="background:' + esc(c) + '" title="' + esc(c) + '" aria-label="Usar a cor ' + esc(c) + '"></button>';
            }).join('');
            controle = '<input class="apb-input" type="color" id="' + id + '" data-apb-prop="' + prop + '" value="' + esc(valor) + '">' +
                (opts.semCores ? '' : '<div class="apb-swatches">' + swatches + '</div>');
        } else {
            controle = '<input class="apb-input" id="' + id + '" type="' + (opts.tipo || 'text') + '" data-apb-prop="' + prop + '" value="' + esc(valor) + '" placeholder="' + esc(opts.placeholder || '') + '">';
        }
        return '<div class="apb-field"><label for="' + id + '">' + esc(label) + '</label>' + controle +
            (opts.hint ? '<span class="apb-hint">' + esc(opts.hint) + '</span>' : '') + '</div>';
    }

    function inspPagina(pg) {
        if (!pg) return '<div class="apb-insp-empty">Nenhuma página aberta.</div>';
        const fontes = Object.keys(FONTES).map(function (f) { return { v: f, l: f }; });
        return '<div class="apb-insp-head">Página <span class="apb-tag">' + pg.secoes.length + ' seção(ões)</span></div>' +
            campo('Nome da página', 'paginaNome', pg.nome, { placeholder: 'Ex.: Sobre o escritório' }) +
            campo('Endereço (slug)', 'paginaSlug', pg.slug, { hint: 'Vira o nome do arquivo exportado: ' + esc(pg.slug) + '.html' }) +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-head">Tema</div>' +
            campo('Cor principal', 'temaPrimaria', pg.tema.primaria, { tipo: 'color' }) +
            campo('Cor de fundo', 'temaFundo', pg.tema.fundo, { tipo: 'color', semCores: true }) +
            campo('Cor do texto', 'temaTexto', pg.tema.texto, { tipo: 'color', semCores: true }) +
            campo('Fonte', 'temaFonte', pg.tema.fonte, { tipo: 'select', opcoes: fontes }) +
            campo('Largura do conteúdo', 'temaLargura', pg.tema.largura, { tipo: 'range', min: 640, max: 1400, step: 20, sufixo: ' px' }) +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-head">Busca e compartilhamento</div>' +
            campo('Título para buscadores', 'seoTitulo', pg.seo.titulo, { placeholder: pg.nome, hint: 'Se ficar vazio, o nome da página é usado.' }) +
            campo('Descrição', 'seoDescricao', pg.seo.descricao, { tipo: 'textarea', rows: 3, placeholder: 'Resumo exibido nos resultados de busca.' }) +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-head">Adicionar</div>' +
            '<div class="apb-insp-actions">' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-page-action="add-secao" data-preset="conteudo">+ Conteúdo</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-page-action="add-secao" data-preset="hero">+ Hero</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-page-action="add-secao" data-preset="destaque">+ Destaque</button>' +
            '</div>' +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-actions">' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-page-action="exportar">Exportar HTML</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-page-action="dup">Duplicar</button>' +
            '<button class="apb-btn apb-btn--sm apb-btn--danger" type="button" data-apb-page-action="del">Excluir</button>' +
            '</div>';
    }

    function inspSecao(sec) {
        const presets = Object.keys(PRESETS).map(function (p) { return { v: p, l: PRESETS[p].nome }; });
        return '<div class="apb-insp-head">Seção <span class="apb-tag">' + (PRESETS[sec.preset] ? PRESETS[sec.preset].nome : 'Conteúdo') + '</span></div>' +
            campo('Título', 'secaoTitulo', sec.titulo, { placeholder: 'Título da seção' }) +
            campo('Subtítulo', 'secaoSubtitulo', sec.subtitulo, { placeholder: 'Subtítulo (opcional)' }) +
            campo('Estilo da seção', 'secaoPreset', sec.preset, { tipo: 'select', opcoes: presets, hint: PRESETS[sec.preset] ? PRESETS[sec.preset].dica : '' }) +
            campo('Âncora (link direto)', 'secaoAncora', sec.ancora, { placeholder: 'ex.: contato', hint: 'Permite criar links para #' + esc(sec.ancora || 'ancora') + ' nesta página.' }) +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-head">Blocos (' + sec.blocos.length + ')</div>' +
            '<div class="apb-insp-actions">' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-sec-action="add-texto">+ Texto</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-sec-action="add-imagem">+ Imagem</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-sec-action="add-link">+ Link</button>' +
            '</div>' +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-actions">' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-sec-action="up">↑ Subir</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-sec-action="down">↓ Descer</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-sec-action="dup">Duplicar</button>' +
            '<button class="apb-btn apb-btn--sm apb-btn--danger" type="button" data-apb-sec-action="del">Excluir</button>' +
            '</div>';
    }

    function inspBloco(b) {
        const alinhamentos = [{ v: 'left', l: 'À esquerda' }, { v: 'center', l: 'Centralizado' }, { v: 'right', l: 'À direita' }];
        let especifico = '';
        if (b.tipo === 'titulo') {
            especifico = campo('Texto do título', 'blocoTexto', b.texto, { placeholder: 'Título' }) +
                campo('Nível', 'blocoNivel', b.nivel, { tipo: 'select', opcoes: [{ v: 'h2', l: 'H2 — grande' }, { v: 'h3', l: 'H3 — médio' }, { v: 'h4', l: 'H4 — pequeno' }] }) +
                campo('Alinhamento', 'blocoAlinhamento', b.alinhamento, { tipo: 'select', opcoes: alinhamentos });
        } else if (b.tipo === 'texto' || b.tipo === 'lista') {
            especifico = campo('Alinhamento', 'blocoAlinhamento', b.alinhamento, { tipo: 'select', opcoes: alinhamentos }) +
                '<p class="apb-hint">Edite o conteúdo diretamente na página. Use a barra de formatação que aparece ao clicar no texto.</p>';
        } else if (b.tipo === 'citacao') {
            especifico = campo('Autor (opcional)', 'blocoAutor', b.autor || '', { placeholder: 'Nome do autor' }) +
                campo('Alinhamento', 'blocoAlinhamento', b.alinhamento, { tipo: 'select', opcoes: alinhamentos }) +
                '<p class="apb-hint">Edite a citação na página.</p>';
        } else if (b.tipo === 'imagem') {
            especifico = campo('Endereço da imagem', 'blocoImagemUrl', b.src, { placeholder: 'https://... ou envie um arquivo', hint: 'Prefira enviar a imagem para que a página funcione sem internet.' }) +
                '<button class="apb-btn apb-btn--sm" type="button" data-apb-block-action="upload">Enviar imagem do computador</button>' +
                campo('Texto alternativo', 'blocoAlt', b.alt, { placeholder: 'Descreva a imagem para acessibilidade' }) +
                campo('Legenda', 'blocoLegenda', b.legenda, { placeholder: 'Legenda (opcional)' }) +
                campo('Largura', 'blocoImagemLargura', b.largura, { tipo: 'range', min: 15, max: 100, step: 5, sufixo: '%' }) +
                campo('Alinhamento', 'blocoAlinhamento', b.alinhamento, { tipo: 'select', opcoes: alinhamentos });
        } else if (b.tipo === 'link') {
            especifico = campo('Texto do link', 'blocoTexto', b.texto, { placeholder: 'Saiba mais' }) +
                campo('Endereço', 'blocoHref', b.href, { placeholder: 'https://... ou #ancora' }) +
                campo('Estilo', 'blocoEstilo', b.estilo, { tipo: 'select', opcoes: [{ v: 'botao', l: 'Botão' }, { v: 'link', l: 'Link de texto' }] }) +
                campo('Abrir em nova aba', 'blocoNovaAba', b.novaAba, { tipo: 'checkbox' }) +
                campo('Alinhamento', 'blocoAlinhamento', b.alinhamento, { tipo: 'select', opcoes: alinhamentos });
        } else if (b.tipo === 'espacador') {
            especifico = campo('Altura', 'blocoAltura', b.altura, { tipo: 'range', min: 8, max: 200, step: 4, sufixo: ' px' });
        } else if (b.tipo === 'divisor') {
            especifico = '<p class="apb-hint">A linha divisória usa automaticamente a cor de borda do tema.</p>';
        }
        return '<div class="apb-insp-head">Bloco <span class="apb-tag">' + (TIPOS_BLOCO[b.tipo] || b.tipo) + '</span></div>' +
            especifico +
            '<div class="apb-divider"></div>' +
            '<div class="apb-insp-actions">' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-block-action="up">↑ Subir</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-block-action="down">↓ Descer</button>' +
            '<button class="apb-btn apb-btn--sm" type="button" data-apb-block-action="dup">Duplicar</button>' +
            '<button class="apb-btn apb-btn--sm apb-btn--danger" type="button" data-apb-block-action="del">Excluir</button>' +
            '</div>';
    }

    function renderInspector() {
        if (!refs.inspector) return;
        const b = blocoAtual();
        const s = (selecao.tipo === 'secao') ? secaoAtual() : null;
        if (b) refs.inspector.innerHTML = inspBloco(b);
        else if (s) refs.inspector.innerHTML = inspSecao(s);
        else refs.inspector.innerHTML = inspPagina(paginaAtual());
    }

    function mostrarFmtbar(el) {
        if (!refs.fmtbar || previa) return;
        posicionarFmtbar(el);
        refs.fmtbar.classList.add('apb-visivel');
    }

    function esconderFmtbar() {
        if (refs.fmtbar) refs.fmtbar.classList.remove('apb-visivel');
    }

    function posicionarFmtbar(el) {
        if (!refs.fmtbar || !el) return;
        refs.fmtbar.classList.add('apb-visivel');
        const r = el.getBoundingClientRect();
        const largura = refs.fmtbar.offsetWidth || 330;
        const altura = refs.fmtbar.offsetHeight || 36;
        let esquerda = r.left + (r.width / 2) - (largura / 2);
        esquerda = Math.max(8, Math.min(esquerda, window.innerWidth - largura - 8));
        let topo = r.top - altura - 8;
        if (topo < 62) topo = Math.min(window.innerHeight - altura - 8, r.bottom + 8);
        refs.fmtbar.style.left = esquerda + 'px';
        refs.fmtbar.style.top = topo + 'px';
    }


    let campoAtivo = null;
    let timerCanvas = null;

    function blocoDoEl(el) {
        const wrap = el.closest ? el.closest('[data-apb-block]') : null;
        return wrap ? acharBloco(wrap.dataset.apbBlock) : null;
    }

    function secaoDoEl(el) {
        const wrap = el.closest ? el.closest('[data-apb-sec]') : null;
        const pg = paginaAtual();
        if (!wrap || !pg) return null;
        return pg.secoes.find(function (s) { return s.id === wrap.dataset.apbSec; }) || null;
    }

    function flushInsp() {
        if (antesInsp === null) return;
        const atual = snapshot();
        if (atual !== antesInsp) empurrarHistorico(antesInsp);
        antesInsp = null;
    }

    function registrar(fn) {
        flushEdicao();
        flushInsp();
        const antes = snapshot();
        try {
            fn();
        } catch (erro) {
            console.error('APB:', erro);
            toast('Não foi possível concluir a ação.', 'erro');
            return false;
        }
        empurrarHistorico(antes);
        const pg = paginaAtual();
        if (pg) pg.atualizadoEm = agora();
        marcarSujo();
        renderTudo();
        return true;
    }

    function copySecao(sec) {
        const copia = clonar(sec);
        copia.id = uid('sec');
        copia.ancora = '';
        copia.blocos = (copia.blocos || []).map(function (b) {
            const nb = clonar(b);
            nb.id = uid('blk');
            return nb;
        });
        return copia;
    }

    function slugUnico(base, ignorarId) {
        const usados = new Set();
        estado.paginas.forEach(function (p) { if (p.id !== ignorarId) usados.add(p.slug); });
        let s = slugify(base || 'pagina');
        let n = 2;
        while (usados.has(s)) {
            s = slugify(base || 'pagina') + '-' + n;
            n += 1;
        }
        return s;
    }

    function acaoNovaPagina(nome) {
        if (estado.paginas.length >= LIMITES.paginas) {
            toast('Limite de ' + LIMITES.paginas + ' páginas atingido.', 'aviso');
            return;
        }
        registrar(function () {
            const pg = criarPagina(nome || 'Nova página');
            pg.slug = slugUnico(pg.slug);
            const i = estado.paginas.findIndex(function (p) { return p.id === estado.atualId; });
            estado.paginas.splice(i >= 0 ? i + 1 : estado.paginas.length, 0, pg);
            estado.atualId = pg.id;
            selecao = { tipo: 'pagina', id: null };
        });
    }

    function acaoIrParaPagina(id) {
        if (!estado.paginas.some(function (p) { return p.id === id; })) return;
        flushEdicao();
        flushInsp();
        estado.atualId = id;
        selecao = { tipo: 'pagina', id: null };
        marcarSujo();
        renderTudo();
    }

    function acaoDuplicarPagina() {
        const atual = paginaAtual();
        if (!atual || estado.paginas.length >= LIMITES.paginas) {
            toast('Limite de páginas atingido.', 'aviso');
            return;
        }
        registrar(function () {
            const copia = clonar(atual);
            copia.id = uid('pg');
            copia.nome = texto(atual.nome + ' (cópia)', 120);
            copia.slug = slugUnico(slugify(copia.nome));
            copia.criadoEm = agora();
            copia.atualizadoEm = agora();
            copia.secoes = atual.secoes.map(copySecao);
            const i = estado.paginas.findIndex(function (p) { return p.id === atual.id; });
            estado.paginas.splice(i + 1, 0, copia);
            estado.atualId = copia.id;
            selecao = { tipo: 'pagina', id: null };
        });
    }

    function acaoExcluirPagina() {
        const atual = paginaAtual();
        if (!atual) return;
        if (estado.paginas.length <= 1) {
            toast('Mantenha ao menos uma página no projeto.', 'aviso');
            return;
        }
        confirmar('Excluir esta página?', 'A página “' + atual.nome + '” e todo o seu conteúdo serão removidos. Você poderá desfazer.', 'Excluir', true).then(function (ok) {
            if (!ok) return;
            registrar(function () {
                const i = estado.paginas.findIndex(function (p) { return p.id === atual.id; });
                estado.paginas.splice(i, 1);
                estado.atualId = estado.paginas[Math.max(0, i - 1)].id;
                selecao = { tipo: 'pagina', id: null };
            });
        });
    }

    function acaoNovaSecao(preset, depoisDe) {
        const pg = paginaAtual();
        if (!pg) return;
        if (pg.secoes.length >= LIMITES.secoes) {
            toast('Limite de seções por página atingido.', 'aviso');
            return;
        }
        registrar(function () {
            const sec = criarSecao(preset || 'conteudo');
            let indice = pg.secoes.length;
            if (depoisDe) {
                const i = pg.secoes.findIndex(function (s) { return s.id === depoisDe; });
                if (i >= 0) indice = i + 1;
            }
            pg.secoes.splice(indice, 0, sec);
            selecao = { tipo: 'secao', id: sec.id };
        });
        rolarParaSelecao();
    }

    function acaoMoverSecao(id, dir) {
        const pg = paginaAtual();
        if (!pg) return;
        const i = pg.secoes.findIndex(function (s) { return s.id === id; });
        const j = i + (dir === 'up' ? -1 : 1);
        if (i < 0 || j < 0 || j >= pg.secoes.length) return;
        registrar(function () {
            const tmp = pg.secoes[i];
            pg.secoes[i] = pg.secoes[j];
            pg.secoes[j] = tmp;
            selecao = { tipo: 'secao', id: id };
        });
        rolarParaSelecao();
    }

    function acaoDuplicarSecao(id) {
        const pg = paginaAtual();
        if (!pg || pg.secoes.length >= LIMITES.secoes) {
            toast('Limite de seções por página atingido.', 'aviso');
            return;
        }
        const i = pg.secoes.findIndex(function (s) { return s.id === id; });
        if (i < 0) return;
        registrar(function () {
            const copia = copySecao(pg.secoes[i]);
            copia.titulo = texto(copia.titulo + ' (cópia)', 200);
            pg.secoes.splice(i + 1, 0, copia);
            selecao = { tipo: 'secao', id: copia.id };
        });
    }

    function acaoExcluirSecao(id) {
        const pg = paginaAtual();
        if (!pg) return;
        const sec = pg.secoes.find(function (s) { return s.id === id; });
        if (!sec) return;
        confirmar('Excluir esta seção?', 'A seção e todos os seus blocos serão removidos. Você poderá desfazer.', 'Excluir', true).then(function (ok) {
            if (!ok) return;
            registrar(function () {
                const i = pg.secoes.findIndex(function (s) { return s.id === id; });
                pg.secoes.splice(i, 1);
                selecao = { tipo: 'pagina', id: null };
            });
        });
    }

    function acaoAdicionarBloco(tipo, secId) {
        const pg = paginaAtual();
        if (!pg) return;
        flushEdicao();
        let sec = null;
        if (secId) sec = pg.secoes.find(function (s) { return s.id === secId; });
        if (!sec) sec = secaoAtual();
        if (!sec) sec = pg.secoes[pg.secoes.length - 1] || null;
        if (sec && sec.blocos.length >= LIMITES.blocos) {
            toast('Limite de blocos nesta seção atingido.', 'aviso');
            return;
        }
        let novo = null;
        registrar(function () {
            if (!sec) {
                sec = criarSecao('conteudo');
                pg.secoes.push(sec);
            }
            const b = criarBloco(tipo);
            sec.blocos.push(b);
            novo = b;
            selecao = { tipo: 'bloco', id: b.id };
        });
        if (novo) {
            if (tipo === 'imagem') {
                toast('Escolha uma imagem do computador ou informe um endereço no painel.');
                escolherImagem(novo.id);
            }
            rolarParaSelecao();
        }
    }

    function acaoMoverBloco(id, dir) {
        const sec = acharSecaoDoBloco(id);
        if (!sec) return;
        const i = sec.blocos.findIndex(function (b) { return b.id === id; });
        const j = i + (dir === 'up' ? -1 : 1);
        if (i < 0 || j < 0 || j >= sec.blocos.length) return;
        registrar(function () {
            const tmp = sec.blocos[i];
            sec.blocos[i] = sec.blocos[j];
            sec.blocos[j] = tmp;
            selecao = { tipo: 'bloco', id: id };
        });
        rolarParaSelecao();
    }

    function acaoDuplicarBloco(id) {
        const sec = acharSecaoDoBloco(id);
        if (!sec) return;
        if (sec.blocos.length >= LIMITES.blocos) {
            toast('Limite de blocos nesta seção atingido.', 'aviso');
            return;
        }
        const i = sec.blocos.findIndex(function (b) { return b.id === id; });
        if (i < 0) return;
        registrar(function () {
            const copia = clonar(sec.blocos[i]);
            copia.id = uid('blk');
            sec.blocos.splice(i + 1, 0, copia);
            selecao = { tipo: 'bloco', id: copia.id };
        });
    }

    function acaoExcluirBloco(id) {
        const sec = acharSecaoDoBloco(id);
        if (!sec) return;
        registrar(function () {
            const i = sec.blocos.findIndex(function (b) { return b.id === id; });
            sec.blocos.splice(i, 1);
            selecao = { tipo: 'secao', id: sec.id };
        });
    }

    function escolherImagem(id) {
        imagemAlvoId = id || (selecao.tipo === 'bloco' ? selecao.id : null);
        if (!imagemAlvoId) {
            toast('Selecione um bloco de imagem primeiro.', 'aviso');
            return;
        }
        if (refs.imgInput) {
            refs.imgInput.value = '';
            refs.imgInput.click();
        }
    }

    function aoEditarCampo(el) {
        const campo = el.dataset.apbField || el.dataset.apbSecField;
        if (!campo) return;
        const rico = !el.dataset.singleLine;
        const valor = rico ? el.innerHTML : el.textContent;
        const b = blocoDoEl(el);
        if (b) {
            if (campo === 'html') b.html = sanitizarHTML(valor);
            else if (campo === 'texto') b.texto = texto(valor, 600);
            else if (campo === 'legenda') b.legenda = texto(valor, 300);
            else if (campo === 'autor') b.autor = texto(valor, 160);
            else return;
        } else {
            const s = secaoDoEl(el);
            if (!s) return;
            if (campo === 'titulo') {
                s.titulo = texto(valor, 200);
                atualizarTituloDaSecaoNaLista(s.id);
                const destaque = el.closest('.apb-sec');
                if (destaque) {
                    const item = refs.sectionsList ? refs.sectionsList.querySelector('[data-apb-secao-item="' + s.id + '"]') : null;
                    if (item) item.classList.add('apb-ativo');
                }
            } else if (campo === 'subtitulo') {
                s.subtitulo = texto(valor, 400);
            } else return;
        }
        const pg = paginaAtual();
        if (pg) pg.atualizadoEm = agora();
        marcarSujo();
        if (rico) posicionarFmtbar(el);
    }

    function processarImagem(file) {
        return new Promise(function (resolve, reject) {
            if (!file) { reject('vazio'); return; }
            const tipos = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
            if (tipos.indexOf(file.type) < 0) { reject('formato'); return; }
            if (file.size > 20 * 1024 * 1024) { reject('grande'); return; }
            const leitor = new FileReader();
            leitor.onerror = function () { reject('leitura'); };
            leitor.onload = function () {
                const data = String(leitor.result || '');
                if (file.type === 'image/gif' && data.length <= LIMITES.imagem) { resolve(data); return; }
                const img = new Image();
                img.onerror = function () { reject('invalida'); };
                img.onload = function () {
                    const max = 1600;
                    let w = img.width;
                    let h = img.height;
                    if (w > max || h > max) {
                        const fator = Math.min(max / w, max / h);
                        w = Math.max(1, Math.round(w * fator));
                        h = Math.max(1, Math.round(h * fator));
                    }
                    const cv = document.createElement('canvas');
                    cv.width = w;
                    cv.height = h;
                    const ctx = cv.getContext('2d');
                    if (!ctx) { reject('canvas'); return; }
                    let saida = '';
                    try {
                        ctx.drawImage(img, 0, 0, w, h);
                        saida = cv.toDataURL('image/webp', 0.86);
                    } catch (erro) { saida = ''; }
                    if (!saida || saida.indexOf('data:image/webp') !== 0) {
                        const cv2 = document.createElement('canvas');
                        cv2.width = w;
                        cv2.height = h;
                        const ctx2 = cv2.getContext('2d');
                        ctx2.fillStyle = '#ffffff';
                        ctx2.fillRect(0, 0, w, h);
                        ctx2.drawImage(img, 0, 0, w, h);
                        saida = cv2.toDataURL('image/jpeg', 0.86);
                        if (saida.length > LIMITES.imagem) saida = cv2.toDataURL('image/jpeg', 0.7);
                    }
                    if (!saida || saida.length > LIMITES.imagem) { reject('grande'); return; }
                    resolve(saida);
                };
                img.src = data;
            };
            leitor.readAsDataURL(file);
        });
    }

    function aplicarImagem(id, src, nomeArquivo) {
        const b = acharBloco(id);
        if (!b) return;
        registrar(function () {
            b.src = src;
            if (!b.alt) b.alt = texto(String(nomeArquivo || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '), 200);
            selecao = { tipo: 'bloco', id: id };
        });
        toast('Imagem adicionada. Ajuste o texto alternativo no painel de propriedades.', 'ok');
    }

    function sincronizarCampoAtivo() {
        if (!campoAtivo || !document.body.contains(campoAtivo)) return;
        aoEditarCampo(campoAtivo);
    }

    function aplicarComando(cmd) {
        const el = campoAtivo;
        if (!el) return;
        el.focus();
        if (cmd === 'h2' || cmd === 'h3' || cmd === 'p') {
            document.execCommand('formatBlock', false, cmd === 'p' ? 'P' : cmd.toUpperCase());
        } else if (cmd === 'createLink') {
            const selecaoSalva = window.getSelection();
            const intervalo = selecaoSalva && selecaoSalva.rangeCount ? selecaoSalva.getRangeAt(0).cloneRange() : null;
            prompt('Inserir link', 'Informe um endereço http(s), mailto:, tel: ou #âncora.', 'https://', 'Inserir').then(function (valor) {
                const url = urlSegura(valor);
                if (!url) {
                    if (valor) toast('Endereço inválido. Use http://, https://, mailto:, tel: ou #âncora.', 'erro');
                    return;
                }
                el.focus();
                if (intervalo) {
                    const nova = window.getSelection();
                    nova.removeAllRanges();
                    nova.addRange(intervalo);
                }
                document.execCommand('createLink', false, url);
                sincronizarCampoAtivo();
            });
            return;
        } else {
            document.execCommand(cmd, false, null);
        }
        sincronizarCampoAtivo();
    }

    function aoColar(e) {
        const el = e.target && e.target.closest ? e.target.closest('[contenteditable="true"]') : null;
        if (!el || !refs.root || !refs.root.contains(el)) return;
        const html = e.clipboardData ? e.clipboardData.getData('text/html') : '';
        const plano = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        e.preventDefault();
        if (el.dataset.singleLine) {
            document.execCommand('insertText', false, String(plano || '').replace(/\s+/g, ' ').slice(0, 600));
        } else if (html) {
            const limpo = sanitizarHTML(html);
            if (limpo) document.execCommand('insertHTML', false, limpo);
            else document.execCommand('insertText', false, plano);
        } else {
            document.execCommand('insertText', false, plano);
        }
    }


    function definirProp(prop, valor) {
        const pg = paginaAtual();
        if (!pg) return false;
        const b = blocoAtual();
        const s = (selecao.tipo === 'secao') ? secaoAtual() : null;
        const v = String(valor == null ? '' : valor);
        switch (prop) {
            case 'paginaNome': {
                const velho = pg.nome;
                pg.nome = texto(v, 120) || 'Sem título';
                if (pg.slug === slugify(velho)) pg.slug = slugify(pg.nome);
                return true;
            }
            case 'paginaSlug': pg.slug = slugify(v); return true;
            case 'seoTitulo': pg.seo.titulo = texto(v, 160); return true;
            case 'seoDescricao': pg.seo.descricao = texto(v, 320); return true;
            case 'temaPrimaria': pg.tema.primaria = cor(v, pg.tema.primaria); return true;
            case 'temaFundo': pg.tema.fundo = cor(v, pg.tema.fundo); return true;
            case 'temaTexto': pg.tema.texto = cor(v, pg.tema.texto); return true;
            case 'temaFonte': pg.tema.fonte = fonteValida(v); return true;
            case 'temaLargura': pg.tema.largura = Math.min(1600, Math.max(640, parseInt(v, 10) || pg.tema.largura)); return true;
            default: break;
        }
        if (s) {
            switch (prop) {
                case 'secaoTitulo': s.titulo = texto(v, 200); return true;
                case 'secaoSubtitulo': s.subtitulo = texto(v, 400); return true;
                case 'secaoPreset': s.preset = PRESETS[v] ? v : s.preset; return true;
                case 'secaoAncora': {
                    let ancora = slugify(v);
                    if (ancora === 'pagina') ancora = '';
                    if (ancora) {
                        const usados = new Set(pg.secoes.filter(function (x) { return x.id !== s.id && x.ancora; }).map(function (x) { return x.ancora; }));
                        const base = ancora;
                        let n = 2;
                        while (usados.has(ancora)) {
                            ancora = base + '-' + n;
                            n += 1;
                        }
                    }
                    s.ancora = ancora;
                    return true;
                }
                default: break;
            }
        }
        if (!b) return false;
        switch (prop) {
            case 'blocoTexto': b.texto = texto(v, 600); return true;
            case 'blocoAutor': b.autor = texto(v, 160); return true;
            case 'blocoAlt': b.alt = texto(v, 300); return true;
            case 'blocoLegenda': b.legenda = texto(v, 300); return true;
            case 'blocoNivel': b.nivel = ['h2', 'h3', 'h4'].indexOf(v) >= 0 ? v : b.nivel; return true;
            case 'blocoAlinhamento': b.alinhamento = ['left', 'center', 'right'].indexOf(v) >= 0 ? v : b.alinhamento; return true;
            case 'blocoEstilo': b.estilo = v === 'link' ? 'link' : 'botao'; return true;
            case 'blocoNovaAba': b.novaAba = !!valor; return true;
            case 'blocoAltura': b.altura = Math.min(200, Math.max(8, parseInt(v, 10) || b.altura)); return true;
            case 'blocoImagemLargura': b.largura = Math.min(100, Math.max(15, parseInt(v, 10) || b.largura)); return true;
            case 'blocoImagemUrl': {
                if (!v.trim()) { b.src = ''; return true; }
                const segura = urlImagemSegura(v);
                if (segura) b.src = segura;
                return !!segura;
            }
            case 'blocoHref': {
                if (!v.trim()) { b.href = ''; return true; }
                const segura = urlSegura(v);
                if (segura) b.href = segura;
                return !!segura;
            }
            default: return false;
        }
    }

    function agendarCanvas() {
        clearTimeout(timerCanvas);
        timerCanvas = setTimeout(function () {
            if (!aberto || !refs.canvasWrap) return;
            const ativo = document.activeElement;
            if (campoAtivo && ativo && refs.canvas && refs.canvas.contains(ativo)) return;
            const y = refs.canvasWrap.scrollTop;
            renderCanvas();
            refs.canvasWrap.scrollTop = y;
        }, 130);
    }

    function aoPropriedade(el) {
        const prop = el.dataset.apbProp;
        if (!prop) return;
        if (antesInsp === null) antesInsp = snapshot();
        const valor = el.type === 'checkbox' ? el.checked : el.value;
        const aplicou = definirProp(prop, valor);
        const pg = paginaAtual();
        if (pg) pg.atualizadoEm = agora();
        if (prop === 'paginaNome' || prop === 'paginaSlug') {
            renderPageSelect();
            renderPagesList();
        }
        if (aplicou) {
            if (prop.indexOf('secao') === 0) renderSectionsList();
            marcarSujo();
            agendarCanvas();
        }
    }

    function aplicarAcaoPagina(acao, preset) {
        if (acao === 'add-secao') acaoNovaSecao(preset || 'conteudo');
        else if (acao === 'dup') acaoDuplicarPagina();
        else if (acao === 'del') acaoExcluirPagina();
        else if (acao === 'exportar') exportarPaginaHTML(paginaAtual());
    }

    function aplicarAcaoSecao(acao, idSec) {
        const sec = (idSec && paginaAtual() ? paginaAtual().secoes.find(function (s) { return s.id === idSec; }) : null) || secaoAtual();
        if (!sec) return;
        if (acao === 'up' || acao === 'down') acaoMoverSecao(sec.id, acao);
        else if (acao === 'dup') acaoDuplicarSecao(sec.id);
        else if (acao === 'del') acaoExcluirSecao(sec.id);
        else if (acao === 'add-texto') acaoAdicionarBloco('texto', sec.id);
        else if (acao === 'add-imagem') acaoAdicionarBloco('imagem', sec.id);
        else if (acao === 'add-link') acaoAdicionarBloco('link', sec.id);
    }

    function aplicarAcaoBloco(acao, idBloco) {
        const b = acharBloco(idBloco) || blocoAtual();
        if (!b) return;
        if (acao === 'up' || acao === 'down') acaoMoverBloco(b.id, acao);
        else if (acao === 'dup') acaoDuplicarBloco(b.id);
        else if (acao === 'del') acaoExcluirBloco(b.id);
        else if (acao === 'upload') escolherImagem(b.id);
    }

    function esconderMenuExport() {
        if (!refs.exportMenu) return;
        refs.exportMenu.classList.remove('apb-aberto');
        if (refs.exportBtn) refs.exportBtn.setAttribute('aria-expanded', 'false');
    }

    function instalarEventos() {
        const $ = function (id) { return document.getElementById(id); };

        $('apbClose').addEventListener('click', fechar);
        $('apbPreview').addEventListener('click', alternarPrevia);
        $('apbSairPrevia').addEventListener('click', sairDaPrevia);
        refs.undo.addEventListener('click', function () { flushEdicao(); flushInsp(); desfazer(); });
        refs.redo.addEventListener('click', function () { flushEdicao(); flushInsp(); refazer(); });

        $('apbHelp').addEventListener('click', function () {
            abrirModal({
                titulo: 'Como usar o construtor',
                texto: 'Crie páginas no menu da esquerda, adicione seções e blocos, e clique em qualquer texto da página para editá-lo. Use Ctrl+S para salvar neste navegador, Ctrl+Z/Ctrl+Y para desfazer e refazer. Ao terminar, use Exportar → Página atual para gerar um HTML seguro, ou Projeto (JSON) para guardar um backup.',
                ok: 'Entendi',
                ocultarCancelar: true
            });
        });

        refs.exportBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const abrirMenu = !refs.exportMenu.classList.contains('apb-aberto');
            refs.exportMenu.classList.toggle('apb-aberto', abrirMenu);
            refs.exportBtn.setAttribute('aria-expanded', abrirMenu ? 'true' : 'false');
        });
        refs.exportMenu.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-apb-export]');
            if (!btn) return;
            esconderMenuExport();
            const tipo = btn.dataset.apbExport;
            if (tipo === 'pagina') exportarPaginaHTML(paginaAtual());
            else if (tipo === 'site') exportarSiteZIP();
            else if (tipo === 'json') exportarProjetoJSON();
            else if (tipo === 'importar') abrirImportacaoJSON();
        });
        document.addEventListener('click', function (e) {
            if (refs.exportMenu && !refs.exportMenu.contains(e.target) && e.target !== refs.exportBtn) esconderMenuExport();
        });

        refs.pageSelect.addEventListener('change', function () { acaoIrParaPagina(refs.pageSelect.value); });
        $('apbNewPage').addEventListener('click', pedirNovaPagina);
        $('apbNewPageTop').addEventListener('click', pedirNovaPagina);
        $('apbAddSection').addEventListener('click', function () { acaoNovaSecao('conteudo'); });
        $('apbBackup').addEventListener('click', restaurarBackup);
        $('apbNovoProjeto').addEventListener('click', function () {
            confirmar('Começar um novo projeto?', 'Todas as páginas atuais serão substituídas por uma página vazia. Exporte o projeto em JSON antes se quiser guardar o que já foi feito.', 'Novo projeto', true).then(function (ok) {
                if (!ok) return;
                registrar(function () {
                    estado = estadoInicial();
                    selecao = { tipo: 'pagina', id: null };
                });
                toast('Novo projeto criado.', 'ok');
            });
        });
        $('apbToggleLeft').addEventListener('click', function () { refs.root.classList.toggle('apb-show-left'); });
        $('apbToggleRight').addEventListener('click', function () { refs.root.classList.toggle('apb-show-right'); });

        refs.canvasWrap.addEventListener('click', aoClicarCanvas);
        refs.canvasWrap.addEventListener('input', function (e) {
            const el = e.target.closest ? e.target.closest('[data-apb-field],[data-apb-sec-field]') : null;
            if (el) aoEditarCampo(el);
        });
        refs.canvasWrap.addEventListener('focusin', aoFocarCampo);
        refs.canvasWrap.addEventListener('focusout', function () {
            flushEdicao();
            setTimeout(function () {
                const ativo = document.activeElement;
                const dentro = ativo && refs.root.contains(ativo) && (ativo.closest && (ativo.closest('[contenteditable="true"]') || (refs.fmtbar && refs.fmtbar.contains(ativo))));
                if (!dentro) {
                    esconderFmtbar();
                    campoAtivo = null;
                }
            }, 0);
        });
        refs.canvasWrap.addEventListener('paste', aoColar);
        refs.canvasWrap.addEventListener('keydown', function (e) {
            const el = e.target.closest ? e.target.closest('[contenteditable="true"][data-single-line]') : null;
            if (el && e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        });
        refs.canvasWrap.addEventListener('scroll', function () {
            if (campoAtivo && refs.fmtbar.classList.contains('apb-visivel')) posicionarFmtbar(campoAtivo);
        });

        refs.fmtbar.addEventListener('mousedown', function (e) { e.preventDefault(); });
        refs.fmtbar.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-cmd]');
            if (!btn) return;
            aplicarComando(btn.dataset.cmd);
        });

        refs.pagesList.addEventListener('click', aoClicarListaPaginas);
        refs.sectionsList.addEventListener('click', aoClicarListaSecoes);

        refs.inspector.addEventListener('input', function (e) {
            const el = e.target.closest ? e.target.closest('[data-apb-prop]') : null;
            if (el) {
                aoPropriedade(el);
                if (el.type === 'range') {
                    const out = el.parentNode ? el.parentNode.querySelector('output') : null;
                    if (out) {
                        const sufixo = el.dataset.apbProp === 'blocoImagemLargura' ? '%' : ' px';
                        out.textContent = el.value + sufixo;
                    }
                }
            }
        });
        refs.inspector.addEventListener('change', function (e) {
            const el = e.target.closest ? e.target.closest('[data-apb-prop]') : null;
            if (!el) return;
            const prop = el.dataset.apbProp;
            flushInsp();
            const b = blocoAtual();
            if (prop === 'paginaSlug') {
                const pg = paginaAtual();
                pg.slug = slugUnico(pg.slug, pg.id);
                renderTudo();
                toast('Endereço da página: ' + pg.slug + '.html', 'ok');
            } else if (prop === 'blocoImagemUrl') {
                if (b) {
                    if (el.value.trim() && !b.src) toast('Endereço de imagem inválido ou muito grande.', 'erro');
                    el.value = b.src || '';
                }
                renderCanvas();
            } else if (prop === 'blocoHref') {
                if (b) {
                    if (el.value.trim() && !b.href) toast('Endereço inválido. Use http://, https://, mailto:, tel: ou #âncora.', 'erro');
                    el.value = b.href || '';
                }
                renderCanvas();
            } else {
                renderCanvas();
            }
        });
        refs.inspector.addEventListener('click', function (e) {
            const swatch = e.target.closest('[data-apb-swatch-prop]');
            if (swatch) {
                flushEdicao();
                flushInsp();
                const antes = snapshot();
                definirProp(swatch.dataset.apbSwatchProp, swatch.dataset.apbSwatch);
                empurrarHistorico(antes);
                marcarSujo();
                renderTudo();
                return;
            }
            const pa = e.target.closest('[data-apb-page-action]');
            if (pa) { aplicarAcaoPagina(pa.dataset.apbPageAction, pa.dataset.preset); return; }
            const sa = e.target.closest('[data-apb-sec-action]');
            if (sa) { aplicarAcaoSecao(sa.dataset.apbSecAction); return; }
            const ba = e.target.closest('[data-apb-block-action]');
            if (ba) { aplicarAcaoBloco(ba.dataset.apbBlockAction); return; }
        });

        refs.modalOk.addEventListener('click', function () {
            const cfg = refs.modalInput.hidden ? true : refs.modalInput.value.trim();
            fecharModal(cfg);
        });
        refs.modalCancel.addEventListener('click', function () { fecharModal(null); });
        refs.modal.addEventListener('click', function (e) {
            if (e.target === refs.modal) fecharModal(null);
        });
        refs.modalInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); fecharModal(refs.modalInput.value.trim()); }
        });

        refs.imgInput.addEventListener('change', function () {
            const file = refs.imgInput.files && refs.imgInput.files[0];
            const alvo = imagemAlvoId;
            refs.imgInput.value = '';
            if (!file || !alvo) return;
            toast('Preparando imagem...', 'ok', 1500);
            processarImagem(file).then(function (src) {
                aplicarImagem(alvo, src, file.name);
            }).catch(function (motivo) {
                const mensagens = {
                    formato: 'Formato não suportado. Use PNG, JPG, WEBP ou GIF.',
                    grande: 'A imagem é grande demais mesmo depois de reduzida. Use uma imagem menor que 4 MB.',
                    leitura: 'Não foi possível ler o arquivo.',
                    invalida: 'O arquivo parece não ser uma imagem válida.'
                };
                toast(mensagens[motivo] || 'Não foi possível usar esta imagem.', 'erro', 6000);
            });
        });

        refs.jsonInput.addEventListener('change', function () {
            const file = refs.jsonInput.files && refs.jsonInput.files[0];
            refs.jsonInput.value = '';
            if (file) importarProjetoDeArquivo(file);
        });

        document.addEventListener('keydown', aoTeclarGlobal, true);
        window.addEventListener('resize', function () {
            if (campoAtivo && refs.fmtbar.classList.contains('apb-visivel')) posicionarFmtbar(campoAtivo);
        });
        window.addEventListener('beforeunload', function () {
            if (sujo) salvarLocal(true);
        });
    }

    function aoClicarCanvas(e) {
        if (!aberto) return;
        const t = e.target;
        const secWrap = t.closest ? t.closest('[data-apb-sec]') : null;
        const blkWrap = t.closest ? t.closest('[data-apb-block]') : null;

        const secBtn = t.closest ? t.closest('[data-apb-sec-action]') : null;
        if (secBtn && secWrap) {
            e.preventDefault();
            e.stopPropagation();
            aplicarAcaoSecao(secBtn.dataset.apbSecAction, secWrap.dataset.apbSec);
            return;
        }
        const blkBtn = t.closest ? t.closest('[data-apb-block-action]') : null;
        if (blkBtn && blkWrap) {
            e.preventDefault();
            e.stopPropagation();
            aplicarAcaoBloco(blkBtn.dataset.apbBlockAction, blkWrap.dataset.apbBlock);
            return;
        }
        const addBloco = t.closest ? t.closest('[data-apb-add-block]') : null;
        if (addBloco && secWrap) {
            e.preventDefault();
            e.stopPropagation();
            acaoAdicionarBloco(addBloco.dataset.apbAddBlock, secWrap.dataset.apbSec);
            return;
        }
        const addSecao = t.closest ? t.closest('[data-apb-add-secao]') : null;
        if (addSecao) {
            e.preventDefault();
            e.stopPropagation();
            acaoNovaSecao(addSecao.dataset.apbAddSecao);
            return;
        }
        const addBlocoBarra = t.closest ? t.closest('[data-apb-add]') : null;
        if (addBlocoBarra) {
            e.preventDefault();
            e.stopPropagation();
            acaoAdicionarBloco(addBlocoBarra.dataset.apbAdd, secWrap ? secWrap.dataset.apbSec : null);
            return;
        }
        const imgBtn = t.closest ? t.closest('[data-apb-img-escolher]') : null;
        if (imgBtn && blkWrap) {
            e.preventDefault();
            e.stopPropagation();
            escolherImagem(blkWrap.dataset.apbBlock);
            return;
        }
        const link = t.closest ? t.closest('a') : null;
        if (link && refs.canvasWrap.contains(link)) {
            if (!previa) {
                e.preventDefault();
                const bl = link.closest('[data-apb-block]');
                if (bl) selecionar('bloco', bl.dataset.apbBlock);
            }
            return;
        }
        if (blkWrap) {
            if (selecao.tipo !== 'bloco' || selecao.id !== blkWrap.dataset.apbBlock) {
                selecionar('bloco', blkWrap.dataset.apbBlock);
            }
        } else if (secWrap) {
            if (selecao.tipo !== 'secao' || selecao.id !== secWrap.dataset.apbSec) {
                selecionar('secao', secWrap.dataset.apbSec);
            }
        } else if (t.closest && t.closest('.apb-page')) {
            selecionar('pagina', null);
        }
    }

    function aoFocarCampo(e) {
        const el = e.target.closest ? e.target.closest('[contenteditable="true"]') : null;
        if (!el) return;
        if (campoAtivo !== el) {
            flushEdicao();
            campoAtivo = el;
            antesEdicao = snapshot();
        }
        const blkWrap = el.closest('[data-apb-block]');
        const secWrap = el.closest('[data-apb-sec]');
        if (blkWrap) {
            if (selecao.tipo !== 'bloco' || selecao.id !== blkWrap.dataset.apbBlock) selecionar('bloco', blkWrap.dataset.apbBlock);
        } else if (secWrap) {
            if (selecao.tipo !== 'secao' || selecao.id !== secWrap.dataset.apbSec) selecionar('secao', secWrap.dataset.apbSec);
        }
        if (!el.dataset.singleLine) mostrarFmtbar(el);
        else esconderFmtbar();
    }

    function aoClicarListaPaginas(e) {
        const li = e.target.closest('[data-apb-pagina]');
        if (!li) return;
        const acao = e.target.closest('[data-apb-pagina-acao]');
        if (acao) {
            e.preventDefault();
            e.stopPropagation();
            if (acao.dataset.apbPaginaAcao === 'dup') {
                acaoIrParaPagina(li.dataset.apbPagina);
                acaoDuplicarPagina();
            } else {
                acaoIrParaPagina(li.dataset.apbPagina);
                acaoExcluirPagina();
            }
            return;
        }
        acaoIrParaPagina(li.dataset.apbPagina);
    }

    function aoClicarListaSecoes(e) {
        const li = e.target.closest('[data-apb-secao-item]');
        if (!li) return;
        const acao = e.target.closest('[data-apb-secao-acao]');
        if (acao) {
            e.preventDefault();
            e.stopPropagation();
            aplicarAcaoSecao(acao.dataset.apbSecaoAcao, li.dataset.apbSecaoItem);
            return;
        }
        selecionar('secao', li.dataset.apbSecaoItem);
        rolarParaSelecao();
    }

    function pedirNovaPagina() {
        prompt('Nova página', 'Dê um nome para a nova página. O nome também define o arquivo exportado.', 'Nova página', 'Criar').then(function (nome) {
            if (nome === null || nome === '') return;
            acaoNovaPagina(nome);
        });
    }

    function aoTeclarGlobal(e) {
        if (!aberto) return;
        const modalAberto = refs.modal && refs.modal.classList.contains('apb-aberto');
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (modalAberto) { fecharModal(null); return; }
            if (refs.exportMenu.classList.contains('apb-aberto')) { esconderMenuExport(); return; }
            if (previa) { sairDaPrevia(); return; }
            esconderFmtbar();
            return;
        }
        if (modalAberto) return;
        const ctrl = e.ctrlKey || e.metaKey;
        const tecla = String(e.key || '').toLowerCase();
        if (ctrl && tecla === 's') {
            e.preventDefault();
            e.stopPropagation();
            flushEdicao();
            flushInsp();
            salvarLocal(false);
            return;
        }
        if (ctrl && tecla === 'z' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            flushEdicao();
            flushInsp();
            desfazer();
            return;
        }
        if (ctrl && (tecla === 'y' || (tecla === 'z' && e.shiftKey))) {
            e.preventDefault();
            e.stopPropagation();
            flushEdicao();
            flushInsp();
            refazer();
        }
    }


    function blocoExportHTML(b) {
        const alinhamento = ['left', 'center', 'right'].indexOf(b.alinhamento) >= 0 ? b.alinhamento : 'left';
        if (b.tipo === 'texto') {
            return '<div class="blk blk--texto" style="text-align:' + alinhamento + '">' + sanitizarHTML(b.html) + '</div>';
        }
        if (b.tipo === 'lista') {
            const html = sanitizarHTML(b.html);
            return html ? '<div class="blk blk--lista" style="text-align:' + alinhamento + '">' + html + '</div>' : '';
        }
        if (b.tipo === 'titulo') {
            const nivel = ['h2', 'h3', 'h4'].indexOf(b.nivel) >= 0 ? b.nivel : 'h3';
            return '<' + nivel + ' class="blk blk--titulo" style="text-align:' + alinhamento + '">' + esc(b.texto) + '</' + nivel + '>';
        }
        if (b.tipo === 'imagem') {
            const src = urlImagemSegura(b.src);
            if (!src) return '';
            return '<div class="blk blk--imagem" style="text-align:' + alinhamento + '">' +
                '<figure style="width:' + b.largura + '%"><img src="' + esc(src) + '" alt="' + esc(b.alt) + '" loading="lazy">' +
                (b.legenda ? '<figcaption>' + esc(b.legenda) + '</figcaption>' : '') + '</figure></div>';
        }
        if (b.tipo === 'link') {
            const href = urlSegura(b.href) || '#';
            const alvo = b.novaAba ? ' target="_blank" rel="noopener noreferrer"' : '';
            const classe = b.estilo === 'link' ? 'btn btn--link' : 'btn';
            return '<div class="blk blk--link" style="text-align:' + alinhamento + '">' +
                '<a class="' + classe + '" href="' + esc(href) + '"' + alvo + '>' + esc(b.texto) + '</a></div>';
        }
        if (b.tipo === 'citacao') {
            const html = sanitizarHTML(b.html);
            if (!html) return '';
            return '<blockquote class="blk blk--citacao" style="text-align:' + alinhamento + '">' + html +
                (b.autor ? '<footer>— ' + esc(b.autor) + '</footer>' : '') + '</blockquote>';
        }
        if (b.tipo === 'divisor') return '<hr class="blk-divisor">';
        if (b.tipo === 'espacador') return '<div class="blk blk--espaco" style="height:' + b.altura + 'px" aria-hidden="true"></div>';
        return '';
    }

    function secaoExportHTML(sec) {
        const ancora = sec.ancora ? ' id="' + esc(sec.ancora) + '"' : '';
        let html = '<section class="sec sec--' + esc(sec.preset) + '"' + ancora + '>';
        if (sec.titulo || sec.subtitulo) {
            html += '<header class="sec-head">';
            if (sec.titulo) html += '<h2 class="sec-title">' + esc(sec.titulo) + '</h2>';
            if (sec.subtitulo) html += '<p class="sec-sub">' + esc(sec.subtitulo) + '</p>';
            html += '</header>';
        }
        const blocos = sec.blocos.map(blocoExportHTML).filter(Boolean).join('');
        html += blocos || '<p class="blk blk--texto">Esta seção ainda não tem conteúdo.</p>';
        html += '</section>';
        return html;
    }

    function cssExportacao(pg) {
        const fonte = FONTES[fonteValida(pg.tema.fonte)].stack;
        return ':root{--primary:' + pg.tema.primaria + ';--bg:' + pg.tema.fundo + ';--fg:' + pg.tema.texto + ';--soft:' + corRgba(pg.tema.primaria, 0.09) + ';--max:' + pg.tema.largura + 'px}' +
            '*{box-sizing:border-box}' +
            'html{-webkit-text-size-adjust:100%}' +
            'body{margin:0;background:var(--bg);color:var(--fg);font-family:' + fonte + ';line-height:1.65;-webkit-font-smoothing:antialiased}' +
            'img{max-width:100%;height:auto;display:block}' +
            'a{color:var(--primary);text-decoration:none}' +
            '.page{max-width:var(--max);margin:0 auto;padding:0 24px}' +
            '.sec{padding:64px 0;border-top:1px solid rgba(15,23,42,.08)}' +
            '.sec:first-child{border-top:0}' +
            '.sec-head{margin:0 0 28px}' +
            '.sec-title{font-size:clamp(1.6rem,3vw,2.1rem);line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}' +
            '.sec-sub{margin:0;font-size:1.05rem;opacity:.75}' +
            '.sec--destaque{background:var(--soft)}' +
            '.sec--destaque .sec-title{color:var(--primary)}' +
            '.sec--hero{background:linear-gradient(135deg,var(--primary) 0%,#0f172a 120%);padding:96px 0;text-align:center;color:#fff}' +
            '.sec--hero .sec-title{color:#fff;font-size:clamp(2rem,5vw,3.2rem)}' +
            '.sec--hero .sec-sub{color:rgba(255,255,255,.86);font-size:1.15rem;max-width:46em;margin:0 auto}' +
            '.sec--hero .blk--texto,.sec--hero .blk--lista,.sec--hero .blk--titulo,.sec--hero .blk--citacao{color:#fff}' +
            '.sec--hero .blk--citacao{background:rgba(255,255,255,.1);border-left-color:#fff}' +
            '.sec--hero .blk--link .btn{background:#fff;color:#0f172a}' +
            '.sec--hero .blk--link .btn--link{background:none;color:#fff}' +
            '.sec--hero .blk--imagem figcaption{color:rgba(255,255,255,.8)}' +
            '.blk{margin:0 0 18px}' +
            '.blk:last-child{margin-bottom:0}' +
            '.blk--texto,.blk--lista{font-size:1.03rem}' +
            '.blk--texto p,.blk--lista p{margin:0 0 14px}' +
            '.blk--texto p:last-child{margin-bottom:0}' +
            '.blk h2,.blk h3,.blk h4{line-height:1.25;margin:22px 0 10px}' +
            '.blk ul,.blk ol{padding-left:1.35em;margin:0 0 14px}' +
            '.blk li{margin:6px 0}' +
            '.blk--citacao{margin:0;padding:16px 22px;border-left:4px solid var(--primary);background:var(--soft);border-radius:0 10px 10px 0;font-size:1.08rem}' +
            '.blk--citacao p{margin:0}' +
            '.blk--citacao footer{margin-top:8px;font-size:.92rem;opacity:.72}' +
            '.blk--imagem figure{margin:0 auto;display:inline-block;max-width:100%}' +
            '.blk--imagem img{border-radius:10px;margin:0 auto}' +
            '.blk--imagem figcaption{margin-top:8px;font-size:.9rem;opacity:.7}' +
            '.blk--link .btn{display:inline-block;padding:12px 22px;border-radius:8px;background:var(--primary);color:#fff;font-weight:600}' +
            '.blk--link .btn--link{background:none;color:var(--primary);padding:0;text-decoration:underline}' +
            '.blk-divisor{border:0;border-top:1px solid rgba(15,23,42,.14);margin:28px 0}' +
            '@media(max-width:640px){.sec{padding:44px 0}.sec--hero{padding:64px 0}.page{padding:0 18px}}' +
            '@media print{body{background:#fff}.sec{break-inside:avoid}}';
    }

    function htmlDaPagina(pg) {
        if (!pg) return '';
        const titulo = pg.seo.titulo ? pg.seo.titulo : pg.nome;
        const descricao = pg.seo.descricao || '';
        const secoes = pg.secoes.length ? pg.secoes.map(secaoExportHTML).join('') : '<section class="sec"><p class="blk blk--texto">Esta página ainda está vazia.</p></section>';
        return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' +
            '<meta charset="utf-8">\n' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https: http:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'">\n' +
            '<meta name="referrer" content="no-referrer">\n' +
            '<meta name="color-scheme" content="light">\n' +
            '<title>' + esc(titulo) + '</title>\n' +
            (descricao ? '<meta name="description" content="' + esc(descricao) + '">\n' : '') +
            '<style>' + cssExportacao(pg) + '</style>\n' +
            '</head>\n<body>\n<main class="page">\n' + secoes + '\n</main>\n</body>\n</html>\n';
    }

    function baixarArquivo(nome, conteudo, tipo) {
        try {
            const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nome;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            return true;
        } catch (erro) {
            console.error('APB:', erro);
            toast('Não foi possível iniciar o download. Verifique as permissões do navegador.', 'erro', 6000);
            return false;
        }
    }

    function nomeArquivoSeguro(base, extensao) {
        const nome = (slugify(base) || 'pagina').slice(0, 60);
        return nome + '.' + extensao;
    }

    function exportarPaginaHTML(pg) {
        flushEdicao();
        flushInsp();
        if (!pg) { toast('Nenhuma página para exportar.', 'aviso'); return; }
        const html = htmlDaPagina(pg);
        if (!html) { toast('Não foi possível montar a página.', 'erro'); return; }
        if (baixarArquivo(nomeArquivoSeguro(pg.slug || pg.nome, 'html'), html, 'text/html;charset=utf-8')) {
            toast('Página exportada: ' + pg.slug + '.html', 'ok', 5000);
        }
    }

    function exportarProjetoJSON() {
        flushEdicao();
        flushInsp();
        const pacote = { app: 'construtor-de-paginas', versao: VERSAO, exportadoEm: agora(), estado: estado };
        const data = agora().slice(0, 10);
        if (baixarArquivo('projeto-' + data + '.json', JSON.stringify(pacote, null, 2), 'application/json;charset=utf-8')) {
            toast('Projeto exportado em JSON.', 'ok');
        }
    }

    function abrirImportacaoJSON() {
        if (refs.jsonInput) {
            refs.jsonInput.value = '';
            refs.jsonInput.click();
        }
    }

    function deduplicarSlugs() {
        const usados = new Set();
        estado.paginas.forEach(function (p) {
            let base = slugify(p.slug || p.nome) || 'pagina';
            let s = base;
            let n = 2;
            while (usados.has(s)) {
                s = base + '-' + n;
                n += 1;
            }
            p.slug = s;
            usados.add(s);
        });
    }

    function importarProjetoDeArquivo(file) {
        if (!file) return;
        if (file.size > 30 * 1024 * 1024) {
            toast('O arquivo é grande demais para importar.', 'erro');
            return;
        }
        const leitor = new FileReader();
        leitor.onerror = function () { toast('Não foi possível ler o arquivo.', 'erro'); };
        leitor.onload = function () {
            let bruto = null;
            try { bruto = JSON.parse(String(leitor.result || '')); } catch (erro) { bruto = null; }
            const valido = bruto ? normalizarProjeto(bruto) : null;
            if (!valido) {
                toast('Arquivo inválido. Selecione um projeto exportado pelo construtor.', 'erro', 6000);
                return;
            }
            const totalSecoes = valido.paginas.reduce(function (soma, p) { return soma + p.secoes.length; }, 0);
            confirmar('Importar este projeto?', 'O projeto tem ' + valido.paginas.length + ' página(s) e ' + totalSecoes + ' seção(ões). O conteúdo atual será substituído (você poderá desfazer).', 'Importar', true).then(function (ok) {
                if (!ok) return;
                registrar(function () {
                    estado = valido;
                    deduplicarSlugs();
                    selecao = { tipo: 'pagina', id: null };
                });
                salvarLocal(true);
                toast('Projeto importado.', 'ok', 5000);
            });
        };
        leitor.readAsText(file, 'utf-8');
    }

    function leiaMeDoSite() {
        return 'Site gerado pelo construtor de páginas\n' +
            '===================================\n\n' +
            'Como publicar\n' +
            '- Envie todos os arquivos .html e este leia-me.txt para qualquer hospedagem estática.\n' +
            '- Abra index.html para ver a primeira página.\n' +
            '- Cada página é um arquivo separado e não depende de servidor, banco de dados ou scripts.\n\n' +
            'Segurança\n' +
            '- Os arquivos HTML exportados não contêm JavaScript e usam uma política de segurança (CSP) que bloqueia scripts, formulários e plugins.\n' +
            '- Imagens enviadas do computador ficam embutidas no próprio HTML.\n' +
            '- Imagens por endereço externo precisam de internet para aparecer.\n\n' +
            'Editar depois\n' +
            '- Use o arquivo projeto.json para reimportar tudo no construtor (Exportar → Importar projeto).\n';
    }

    function exportarSiteSemZip(paginas) {
        toast('Compactador indisponível. Os arquivos serão baixados um a um, aguarde.', 'aviso', 6000);
        paginas.forEach(function (pg, i) {
            setTimeout(function () {
                baixarArquivo(nomeArquivoSeguro(pg.slug || pg.nome, 'html'), htmlDaPagina(pg), 'text/html;charset=utf-8');
            }, i * 700);
        });
        setTimeout(function () {
            baixarArquivo('leia-me.txt', leiaMeDoSite(), 'text/plain;charset=utf-8');
        }, paginas.length * 700 + 400);
    }

    function exportarSiteZIP() {
        flushEdicao();
        flushInsp();
        if (!estado || !estado.paginas.length) return;
        const paginas = estado.paginas.slice();
        if (typeof JSZip === 'undefined') {
            exportarSiteSemZip(paginas);
            return;
        }
        let zip;
        try { zip = new JSZip(); } catch (erro) { exportarSiteSemZip(paginas); return; }
        const usados = new Set();
        paginas.forEach(function (pg, i) {
            let slug = slugify(pg.slug || pg.nome) || 'pagina';
            while (usados.has(slug)) slug += '-2';
            usados.add(slug);
            zip.file(slug + '.html', htmlDaPagina(pg));
            if (i === 0) zip.file('index.html', htmlDaPagina(pg));
        });
        const pacote = { app: 'construtor-de-paginas', versao: VERSAO, exportadoEm: agora(), estado: estado };
        zip.file('projeto.json', JSON.stringify(pacote, null, 2));
        zip.file('leia-me.txt', leiaMeDoSite());
        toast('Gerando o pacote do site...', 'ok', 2500);
        zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (blob) {
            if (baixarArquivo('site-' + agora().slice(0, 10) + '.zip', blob, 'application/zip')) {
                toast('Site exportado em ZIP com ' + paginas.length + ' página(s).', 'ok', 5000);
            }
        }).catch(function (erro) {
            console.error('APB:', erro);
            exportarSiteSemZip(paginas);
        });
    }

    let iniciado = false;

    function registrarFalhaInicio(erro) {
        let pagina = '';
        try { pagina = location.href; } catch (e) { pagina = ''; }
        window.__apbErroInicio = {
            mensagem: erro && erro.message ? erro.message : String(erro),
            nome: erro && erro.name ? String(erro.name) : 'Error',
            filename: erro && erro.fileName ? String(erro.fileName) : pagina,
            lineno: erro && erro.lineNumber ? Number(erro.lineNumber) : 0,
            colno: erro && erro.columnNumber ? Number(erro.columnNumber) : 0,
            pilha: erro && erro.stack ? String(erro.stack) : '',
            sintaxe: !!(erro && (erro.name === 'SyntaxError' || /SyntaxError/.test(String(erro.message || '')))),
            tipo: 'inicializacao',
            origem: 'documento',
            em: new Date().toISOString()
        };
        try { console.error('APB: falha ao iniciar o construtor.', erro); } catch (e) { /* console indisponível */ }
        try { document.dispatchEvent(new CustomEvent('apb-falha')); } catch (e) { /* sem CustomEvent */ }
    }

    function iniciar() {
        if (iniciado) return;
        iniciado = true;
        try {
            montarUI();
            try { document.dispatchEvent(new CustomEvent('apb-iniciando')); } catch (e) { /* sem CustomEvent */ }
            carregarProjeto();
            instalarEventos();
            injetarBotaoNav();
            garantirSelecaoValida();
            renderTudo();
            window.APB = {
                versao: VERSAO,
                abrir: abrir,
                fechar: fechar,
                estado: function () { return estado; },
                pagina: paginaAtual,
                exportarHTML: function (indice) {
                    const pg = typeof indice === 'number' ? estado.paginas[indice] : paginaAtual();
                    return htmlDaPagina(pg);
                },
                exportarJSON: function () { return JSON.stringify(estado); },
                salvar: function () { return salvarLocal(true); },
                render: renderTudo
            };
            try { document.dispatchEvent(new CustomEvent('apb-pronto')); } catch (e) { /* sem CustomEvent */ }
            if (window.__apbQuerAbrir) {
                window.__apbQuerAbrir = false;
                try { abrir(); } catch (erro) { registrarFalhaInicio(erro); }
            }
        } catch (erro) {
            registrarFalhaInicio(erro);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();

    setTimeout(function () {
        if (typeof window.APB === 'undefined' && !window.__apbErroInicio) {
            iniciado = false;
            iniciar();
        }
    }, 3000);
})();
