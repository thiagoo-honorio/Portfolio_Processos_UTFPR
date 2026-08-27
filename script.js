        /* ================================================
           DROPDOWN DE EXPORTAÇÃO (VANILLA JS)
        ================================================ */
        function toggleExportDropdown() {
            const menu = document.getElementById('exportDropdownMenu');
            const isOpen = menu.classList.contains('show');
            if (isOpen) { closeExportDropdown(); }
            else {
                menu.classList.add('show');
                document.addEventListener('click', closeExportDropdownOutside, true);
            }
        }

        function closeExportDropdown() {
            const menu = document.getElementById('exportDropdownMenu');
            if (menu) menu.classList.remove('show');
            document.removeEventListener('click', closeExportDropdownOutside, true);
        }

        function closeExportDropdownOutside(e) {
            const dropdown = document.getElementById('exportDropdown');
            if (dropdown && !dropdown.contains(e.target)) closeExportDropdown();
        }

        /* ================================================
           UTILITÁRIOS
        ================================================ */
        function escaparHTML(texto) {
            return String(texto == null ? '' : texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function normalizarBusca(texto) {
            return (texto || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        let sequenciaIds = 0;
        function gerarId(prefixo) { return prefixo + '_' + Date.now().toString(36) + '_' + (++sequenciaIds); }

        /* ================================================
           MODO DE EDIÇÃO
        ================================================ */
        let editMode = false;

        function aplicarEstadoEditavel() {
            document.querySelectorAll('[data-editable="true"]').forEach(el => {
                el.contentEditable = editMode ? 'true' : 'false';
            });
            document.querySelectorAll('.chevron-item, .management-bar').forEach(item => {
                item.draggable = editMode;
            });
            try { instalarPreviewsEtapas(); } catch (err) { console.error('Prévias das etapas:', err); }
        }

        function toggleEditMode() {
            editMode = !editMode;
            document.body.classList.toggle('editing', editMode);
            const btn = document.getElementById('btnToggleEdit');
            const indicator = document.getElementById('editIndicator');

            if (editMode) {
                btn.classList.add('btn-custom-success');
                btn.innerText = 'Concluir Edição';
                indicator.classList.add('active');
            } else {
                btn.classList.remove('btn-custom-success');
                btn.innerText = 'Editar';
                indicator.classList.remove('active');
            }
            aplicarEstadoEditavel();
        }

        function mudarCorAtor(actorKey, tipo, cor) {
            const row = document.querySelector(`.actor-row[data-actor="${actorKey}"]`);
            if (!row) return;
            if (tipo === 'border') {
                row.querySelector('.actor-card').style.borderColor = cor;
                row.querySelector('.actor-card').style.color = cor;
            } else {
                row.querySelector('.actor-description').style.backgroundColor = cor;
            }

        }

        function removerAtor(btn) {
            const row = btn.closest('.actor-row');
            const key = row ? row.getAttribute('data-actor') : null;
            const vinculados = key ? state.nodes.filter(n => n.actorId === key).length : 0;
            let msg = 'Remover este ator?';
            if (vinculados > 0) msg += '\n\n' + vinculados + ' elemento(s) do mapa estão vinculados a ele e ficarão sem vínculo.';
            if (!confirm(msg)) return;
            if (key) state.nodes.forEach(n => { if (n.actorId === key) n.actorId = ''; });
            row.remove();

        }

        function adicionarAtor() {
            const key = gerarId('ator');
            const html = criarLinhaAtorHTML({
                key: key,
                cardHTML: 'Novo Ator',
                cardBorder: '#2563eb',
                cardColor: '#2563eb',
                bg: '#dbeafe',
                descHTML: 'Descrição do novo ator...'
            });
            document.getElementById('actorsList').insertAdjacentHTML('beforeend', html);
            aplicarEstadoEditavel();
            instalarTogglesAtores();

        }

        function mudarCorEtapa(input, stepKey) {
            const item = input.closest('.chevron-item') || input.closest('.management-bar');
            if (item) {
                item.style.backgroundColor = input.value;
                item.dataset.color = input.value;
            }
        }

        function removerEtapa(btn) {
            if (!confirm('Remover esta etapa?')) return;
            const item = btn.closest('.chevron-item');
            const preview = item.nextElementSibling;
            if (preview && preview.classList.contains('etapa-preview')) preview.remove();
            item.remove();

        }

        function adicionarEtapa() {
            const id = gerarId('step');
            const html = criarEtapaHTML({ stepKey: id, cor: '#6366f1', titulo: 'Nova Etapa', desc: '(Descrição)', img: '' });
            document.getElementById('chevronPipeline').insertAdjacentHTML('beforeend', html);
            aplicarEstadoEditavel();

        }

        /* ================================================
           SEÇÃO 1: FILTRO & NAVEGAÇÃO
        ================================================ */
        function filterActors() {
            const filter = normalizarBusca(document.getElementById('filterInput').value);
            const rows = document.getElementsByClassName('actor-row');
            for (let i = 0; i < rows.length; i++) {
                const card = rows[i].querySelector('.actor-card');
                const desc = rows[i].querySelector('.actor-description');
                const alvo = normalizarBusca((card ? card.innerText : '') + ' ' + (desc ? desc.innerText : ''));
                rows[i].style.display = alvo.indexOf(filter) > -1 ? "flex" : "none";
            }
        }

        function instalarToggleAtor(row) {
            if (!row || row.querySelector('.ator-toggle-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ator-toggle-btn';
            btn.innerHTML = '<span>(+)</span>';
            btn.title = 'Ampliar / recolher texto do ator';
            btn.setAttribute('aria-expanded', 'false');
            btn.addEventListener('click', (e) => { e.stopPropagation(); alternarExpansaoAtor(row); });
            const card = row.querySelector('.actor-card');
            if (card && card.nextSibling) row.insertBefore(btn, card.nextSibling);
            else row.appendChild(btn);

            // Prévia do fluxo: aparece apenas com o texto oculto, indicando que há mais conteúdo
            const thumbOriginal = row.querySelector('.actor-description .jornada-thumb');
            if (thumbOriginal) {
                const preview = document.createElement('div');
                preview.className = 'ator-preview';
                preview.title = 'Este ator possui um fluxo mapeado — clique para ampliar ou use (+) para ler o texto';
                const img = document.createElement('img');
                img.src = thumbOriginal.getAttribute('src');
                img.alt = thumbOriginal.alt || 'Prévia do fluxo do ator';
                const cap = document.createElement('span');
                cap.innerText = 'Clique na imagem para ampliar';
                preview.appendChild(img);
                preview.appendChild(cap);
                preview.addEventListener('click', openJornada);
                if (btn.nextSibling) row.insertBefore(preview, btn.nextSibling);
                else row.appendChild(preview);
            }

            // Reflete no botão se a linha já veio expandida (ex.: estado exportado)
            if (row.classList.contains('expandido')) {
                const span = btn.querySelector('span');
                if (span) span.innerText = '(−)';
                btn.setAttribute('aria-expanded', 'true');
            }
        }

        function alternarExpansaoAtor(row, forcarEstado) {
            if (!row) return;
            const vaiAbrir = forcarEstado !== undefined ? forcarEstado : !row.classList.contains('expandido');
            row.classList.toggle('expandido', vaiAbrir);
            const span = row.querySelector('.ator-toggle-btn span');
            if (span) span.innerText = vaiAbrir ? '(−)' : '(+)';
            const btn = row.querySelector('.ator-toggle-btn');
            if (btn) btn.setAttribute('aria-expanded', String(vaiAbrir));
        }

        function instalarTogglesAtores() {
            document.querySelectorAll('#actorsList .actor-row').forEach(instalarToggleAtor);
        }

        // Expande todos os atores (usado nas exportações para incluir o texto completo)
        function expandirTodosAtores(escopo) {
            escopo.querySelectorAll('#actorsList .actor-row').forEach(row => {
                row.classList.add('expandido');
                const span = row.querySelector('.ator-toggle-btn span');
                if (span) span.innerText = '(−)';
                const btn = row.querySelector('.ator-toggle-btn');
                if (btn) btn.setAttribute('aria-expanded', 'true');
            });
        }

        function focarAtorNaLista(actorKey) {
            if (!actorKey) return;
            const sec1Content = document.getElementById('sec1Content');
            if (sec1Content.style.display === 'none') toggleSection('sec1Content', 'sec1Toggle');
            const row = document.querySelector(`.actor-row[data-actor="${actorKey}"]`);
            if (row) {
                alternarExpansaoAtor(row, true);
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('actor-highlight');
                setTimeout(() => row.classList.remove('actor-highlight'), 2000);
            }
        }

        function focarAtorNoMapa(actorKey) {
            const sec2Content = document.getElementById('sec2Content');
            if (sec2Content.style.display === 'none') toggleSection('sec2Content', 'sec2Toggle');
            const node = state.nodes.find(n => n.actorId === actorKey);
            if (node) {
                selecionarNode(node.id, false);
                const container = document.getElementById('canvasContainer');
                zoom = 1;
                panX = (container.clientWidth / 2) - (node.x + node.w / 2);
                panY = (container.clientHeight / 2) - (node.y + node.h / 2);
                atualizarTransform();
                const el = document.getElementById(node.id);
                if (el) { el.classList.add('highlighted'); setTimeout(() => el.classList.remove('highlighted'), 2000); }
            } else {
                alert('Nenhum elemento no mapa interativo está vinculado ao ator selecionado.');
            }
        }

        /* ================================================
           SEÇÃO 2: MAPEAMENTO INTERATIVO & ESTADO
        ================================================ */
        const mapaInicialNodes = [
            { id: 'node_1', actorId: 'estudante', title: 'ESTUDANTE', sub: 'SISTEMA ACADÊMICO', x: 40, y: 50, w: 180, h: 80, bg: '#0070c0', color: '#ffffff' },
            { id: 'node_2', actorId: '', title: 'VAGA DE ESTÁGIO', sub: 'EDITAIS\nEMPRESAS\nAGÊNCIAS\nSISTEMA ACADÊMICO', x: 260, y: 30, w: 200, h: 120, bg: '#0070c0', color: '#ffffff' },
            { id: 'node_3', actorId: '', title: 'DOCUMENTOS', sub: 'TERMO DE COMPROMISSO\nPLANO DE ESTÁGIO', x: 520, y: 30, w: 200, h: 100, bg: '#0070c0', color: '#ffffff' },
            { id: 'node_4', actorId: 'estudante', title: 'ALUNO ALIMENTA SISTEMA', sub: 'Preenche campos\nUpload documentos\nAssina', x: 520, y: 200, w: 220, h: 120, bg: '#0070c0', color: '#ffffff' },
            { id: 'node_5', actorId: 'orientador', title: 'ORIENTADOR', sub: 'ANALISA PROCESSO,\nASSINA DOCUMENTOS', x: 200, y: 200, w: 180, h: 70, bg: '#e66a1f', color: '#ffffff' },
            { id: 'node_6', actorId: 'prae', title: 'PRAE', sub: 'ANALISA PROCESSO, ASSINA\nDOCUMENTOS', x: 200, y: 280, w: 180, h: 70, bg: '#4f7928', color: '#ffffff' },
            { id: 'node_7', actorId: 'dieem', title: 'DIEEM', sub: '', x: 200, y: 440, w: 260, h: 60, bg: '#7030a0', color: '#ffffff' },
            { id: 'node_8', actorId: '', title: 'ESTÁGIO EM VIGÊNCIA', sub: '', x: 520, y: 440, w: 200, h: 70, bg: '#0070c0', color: '#ffffff' }
        ];

        const mapaInicialConexoes = [
            { de: 'node_1', para: 'node_2' }, { de: 'node_2', para: 'node_3' },
            { de: 'node_3', para: 'node_4' }, { de: 'node_4', para: 'node_3' },
            { de: 'node_4', para: 'node_5' }, { de: 'node_5', para: 'node_4' },
            { de: 'node_4', para: 'node_6' }, { de: 'node_6', para: 'node_4' },
            { de: 'node_5', para: 'node_7' }, { de: 'node_6', para: 'node_7' },
            { de: 'node_7', para: 'node_8' }
        ];

        let state = {
            nodes: JSON.parse(JSON.stringify(mapaInicialNodes)),
            conexoes: JSON.parse(JSON.stringify(mapaInicialConexoes))
        };

        let historico = [], historicoIndex = -1;
        let nodeSelecionadoId = null, modoConexao = false, nodeOrigemConexao = null;
        let tipoModoConexao = 'direta';
        let panX = 0, panY = 0, zoom = 1;
        let isPanning = false, startPanX = 0, startPanY = 0;

        function renderizarMapa() {
            const container = document.getElementById('nodesContainer');
            container.innerHTML = '';
            state.nodes.forEach(node => {
                const el = document.createElement('div');
                el.className = `map-node ${node.id === nodeSelecionadoId ? 'selected' : ''}`;
                el.id = node.id;
                el.style.cssText = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;background-color:${node.bg};color:${node.color};`;
                el.innerHTML = `<div class="map-node-title">${escaparHTML(node.title)}</div>${node.sub ? `<div class="map-node-sub">${escaparHTML(node.sub)}</div>` : ''}<div class="resize-handle"></div>`;
                el.addEventListener('mousedown', (e) => iniciarDragNode(e, node));
                el.addEventListener('click', (e) => { e.stopPropagation(); modoConexao ? processarConexao(node.id) : selecionarNode(node.id, false); });
                el.querySelector('.resize-handle').addEventListener('mousedown', (e) => iniciarResizeNode(e, node));
                container.appendChild(el);
            });
            renderizarConexoes();
        }

        // Calcula os pontos da linha nas bordas dos retângulos (não nos centros),
        // para que as setas fiquem visíveis fora das caixas.
        function pontosDaLinha(de, para) {
            function borda(n, alvoX, alvoY) {
                const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
                const dx = alvoX - cx, dy = alvoY - cy;
                const fator = Math.max(Math.abs(dx) / (n.w / 2), Math.abs(dy) / (n.h / 2)) || 1;
                return [cx + dx / fator, cy + dy / fator];
            }
            const cxDest = para.x + para.w / 2, cyDest = para.y + para.h / 2;
            const cxOrig = de.x + de.w / 2, cyOrig = de.y + de.h / 2;
            const p1 = borda(de, cxDest, cyDest);
            const p2 = borda(para, cxOrig, cyOrig);
            return { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] };
        }

        // Garante os dois marcadores de seta com traço fino padronizado.
        // Recria sempre (substitui versões antigas/grossas de páginas e exports anteriores).
        function garantirMarcadores(svg) {
            const NS = 'http://www.w3.org/2000/svg';
            let defs = svg.querySelector('defs');
            if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
            ['arrow', 'arrowReversa'].forEach(id => {
                const antigo = defs.querySelector('#' + id);
                if (antigo) antigo.remove();
            });
            function criarSeta(id, refX, orient) {
                const m = document.createElementNS(NS, 'marker');
                m.setAttribute('id', id); m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '4');
                m.setAttribute('refX', refX); m.setAttribute('refY', '2'); m.setAttribute('orient', orient);
                const p = document.createElementNS(NS, 'polygon');
                p.setAttribute('points', '0 0, 7 2, 0 4'); p.setAttribute('fill', '#1e293b');
                m.appendChild(p); defs.appendChild(m);
            }
            criarSeta('arrow', '6.5', 'auto');
            criarSeta('arrowReversa', '1', 'auto-start-reverse');
        }

        function renderizarConexoes() {
            const svg = document.getElementById('svgLayer');
            garantirMarcadores(svg);
            const defs = svg.querySelector('defs');
            svg.innerHTML = '';
            svg.appendChild(defs);
            state.conexoes.forEach((conn, index) => {
                const de = state.nodes.find(n => n.id === conn.de);
                const para = state.nodes.find(n => n.id === conn.para);
                if (!de || !para) return;
                const tipo = conn.tipo || 'direta';
                const pts = pontosDaLinha(de, para);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', pts.x1); line.setAttribute('y1', pts.y1);
                line.setAttribute('x2', pts.x2); line.setAttribute('y2', pts.y2);
                line.setAttribute('class', 'connection-line'); line.setAttribute('stroke', '#1e293b');
                if (tipo !== 'inversa') line.setAttribute('marker-end', 'url(#arrow)');
                if (tipo !== 'direta') line.setAttribute('marker-start', 'url(#arrowReversa)');
                line.dataset.de = conn.de; line.dataset.para = conn.para;
                line.onclick = (e) => { e.stopPropagation(); if (confirm('Deseja excluir esta conexão?')) { salvarHistorico(); const idx = state.conexoes.indexOf(conn); if (idx > -1) state.conexoes.splice(idx, 1); renderizarConexoes();} };
                svg.appendChild(line);
            });
        }

        function selecionarNode(id, autoScrollToActor = true) {
            nodeSelecionadoId = id;
            document.querySelectorAll('.map-node').forEach(n => n.classList.remove('selected'));
            const node = state.nodes.find(n => n.id === id);
            const form = document.getElementById('propForm');
            const msg = document.getElementById('noSelectionMsg');
            if (node) {
                const el = document.getElementById(id);
                if (el) el.classList.add('selected');
                form.style.display = 'flex'; msg.style.display = 'none';
                document.getElementById('propTitle').value = node.title;
                document.getElementById('propSub').value = node.sub;
                document.getElementById('propActor').value = node.actorId || '';
                document.getElementById('propBg').value = rgbToHex(node.bg);
                document.getElementById('propTextColor').value = rgbToHex(node.color);
                document.getElementById('propW').value = node.w;
                document.getElementById('propH').value = node.h;
                if (autoScrollToActor && node.actorId) focarAtorNaLista(node.actorId);
            } else {
                form.style.display = 'none'; msg.style.display = 'block';
            }
        }

        function atualizarElementoSelecionado() {
            if (!nodeSelecionadoId) return;
            const node = state.nodes.find(n => n.id === nodeSelecionadoId);
            if (node) {
                node.title = document.getElementById('propTitle').value;
                node.sub = document.getElementById('propSub').value;
                node.actorId = document.getElementById('propActor').value;
                node.bg = document.getElementById('propBg').value;
                node.color = document.getElementById('propTextColor').value;
                node.w = parseInt(document.getElementById('propW').value) || 100;
                node.h = parseInt(document.getElementById('propH').value) || 50;
                agendarHistorico();
                renderizarMapa();

            }
        }

        function adicionarCaixa() {
            salvarHistorico();
            const id = gerarId('node');
            state.nodes.push({ id, actorId: '', title: 'NOVA ETAPA', sub: 'Descrição', x: 100 - panX, y: 100 - panY, w: 160, h: 70, bg: '#0070c0', color: '#ffffff' });
            renderizarMapa(); selecionarNode(id, false);

        }

        function duplicarSelecionado() {
            if (!nodeSelecionadoId) return;
            const node = state.nodes.find(n => n.id === nodeSelecionadoId);
            if (node) { salvarHistorico(); const id = gerarId('node'); state.nodes.push({ ...JSON.parse(JSON.stringify(node)), id, x: node.x + 20, y: node.y + 20 }); renderizarMapa(); selecionarNode(id, false); }
        }

        function excluirSelecionado() {
            if (!nodeSelecionadoId) return;
            salvarHistorico();
            state.nodes = state.nodes.filter(n => n.id !== nodeSelecionadoId);
            state.conexoes = state.conexoes.filter(c => c.de !== nodeSelecionadoId && c.para !== nodeSelecionadoId);
            nodeSelecionadoId = null; selecionarNode(null); renderizarMapa();

        }

        const ROTULOS_CONEXAO = {
            direta: 'Direta (origem ➜ destino)',
            inversa: 'Inversa (destino ➜ origem)',
            dupla: 'Dupla (ida e volta)'
        };
        const IDS_BOTOES_CONEXAO = {
            direta: ['btnConnectDireta', 'btnConnect'],
            inversa: ['btnConnectInversa'],
            dupla: ['btnConnectDupla']
        };

        function atualizarBotoesConexao() {
            Object.keys(IDS_BOTOES_CONEXAO).forEach(tipo => {
                IDS_BOTOES_CONEXAO[tipo].forEach(id => {
                    const b = document.getElementById(id);
                    if (!b) return;
                    b.classList.toggle('btn-custom-success', modoConexao && tipo === tipoModoConexao);
                });
            });
            if (!modoConexao) {
                document.querySelectorAll('.connecting-origin').forEach(el => el.classList.remove('connecting-origin'));
            }
        }

        function alternarModoConexao(tipo) {
            const solicitado = tipo || null;
            if (!solicitado) {
                modoConexao = !modoConexao; // chamada sem argumento: liga/desliga com o último tipo
            } else if (modoConexao && tipoModoConexao === solicitado) {
                modoConexao = false; // clicar de novo no mesmo botão desativa
            } else {
                modoConexao = true;
                tipoModoConexao = solicitado;
            }
            nodeOrigemConexao = null;
            atualizarBotoesConexao();
            if (modoConexao) toast('Conexão ' + ROTULOS_CONEXAO[tipoModoConexao] + ': clique no nó de origem e depois no de destino. Esc cancela.', 'info', null, 4000);
        }

        function cancelarModoConexao() {
            modoConexao = false;
            nodeOrigemConexao = null;
            atualizarBotoesConexao();
        }

        function processarConexao(nodeId) {
            if (!nodeOrigemConexao) {
                nodeOrigemConexao = nodeId;
                const el = document.getElementById(nodeId);
                if (el) el.classList.add('connecting-origin');
            }
            else if (nodeOrigemConexao !== nodeId) {
                salvarHistorico();
                state.conexoes.push({ de: nodeOrigemConexao, para: nodeId, tipo: tipoModoConexao });
                cancelarModoConexao();
                renderizarConexoes();

                toast('Conexão ' + ROTULOS_CONEXAO[tipoModoConexao] + ' criada.', 'success');
            }
        }

        function aplicarEstiloNode(node) {
            const el = document.getElementById(node.id);
            if (!el) return;
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
            el.style.width = node.w + 'px';
            el.style.height = node.h + 'px';
        }

        function atualizarLinhasDoNode(nodeId) {
            document.querySelectorAll(`#svgLayer line[data-de="${nodeId}"], #svgLayer line[data-para="${nodeId}"]`).forEach(line => {
                const de = state.nodes.find(n => n.id === line.dataset.de);
                const para = state.nodes.find(n => n.id === line.dataset.para);
                if (!de || !para) return;
                const pts = pontosDaLinha(de, para);
                line.setAttribute('x1', pts.x1); line.setAttribute('y1', pts.y1);
                line.setAttribute('x2', pts.x2); line.setAttribute('y2', pts.y2);
            });
        }

        function iniciarDragNode(e, node) {
            if (e.target.classList.contains('resize-handle')) return;
            e.stopPropagation();
            let startX = e.clientX, startY = e.clientY, origX = node.x, origY = node.y;
            let moveu = false;
            function onMove(ev) {
                moveu = true;
                node.x = origX + (ev.clientX - startX) / zoom;
                node.y = origY + (ev.clientY - startY) / zoom;
                aplicarEstiloNode(node);
                atualizarLinhasDoNode(node.id);
            }
            function onUp() {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                if (moveu) { salvarHistorico();}
            }
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        }

        function iniciarResizeNode(e, node) {
            e.stopPropagation();
            let startX = e.clientX, startY = e.clientY, origW = node.w, origH = node.h;
            let moveu = false;
            function onMove(ev) {
                moveu = true;
                node.w = Math.max(80, origW + (ev.clientX - startX) / zoom);
                node.h = Math.max(40, origH + (ev.clientY - startY) / zoom);
                aplicarEstiloNode(node);
                atualizarLinhasDoNode(node.id);
            }
            function onUp() {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                if (moveu) { salvarHistorico();}
            }
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        }

        function atualizarTransform() {
            document.getElementById('canvasWorld').style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        }

        function alterarZoom(delta) { zoom = Math.min(3, Math.max(0.4, zoom + delta)); atualizarTransform(); }
        function resetarVisao() { panX = 0; panY = 0; zoom = 1; atualizarTransform(); }

        const LIMITE_HISTORICO = 50;
        function salvarHistorico() {
            if (historicoIndex < historico.length - 1) historico = historico.slice(0, historicoIndex + 1);
            historico.push(JSON.stringify(state)); historicoIndex++;
            if (historico.length > LIMITE_HISTORICO) {
                historico.splice(0, historico.length - LIMITE_HISTORICO);
                historicoIndex = historico.length - 1;
            }
            agendarAutoSave();
        }

        let historicoTimer = null;
        function agendarHistorico() { clearTimeout(historicoTimer); historicoTimer = setTimeout(salvarHistorico, 400); }

        function desfazer() { if (historicoIndex > 0) { historicoIndex--; state = JSON.parse(historico[historicoIndex]); nodeSelecionadoId = null; renderizarMapa(); selecionarNode(null);} }
        function refazer() { if (historicoIndex < historico.length - 1) { historicoIndex++; state = JSON.parse(historico[historicoIndex]); nodeSelecionadoId = null; renderizarMapa(); selecionarNode(null);} }

        function toggleSection(contentId, toggleBtnId) {
            const content = document.getElementById(contentId);
            const btn = document.getElementById(toggleBtnId);
            if (!content || !btn) return;
            if (content.style.display === 'none') { content.style.display = 'block'; btn.innerText = '[−] Ocultar'; }
            else { content.style.display = 'none'; btn.innerText = '[+] Expandir'; }
        }

        function abrirImgCadeia(src) {
            if (!src) return;
            const lb = document.getElementById('jornadaLightbox');
            const img = lb ? lb.querySelector('.jornada-lightbox-img') : null;
            if (img) { img.src = src; lb.classList.add('active'); }
        }

        function adicionarLinhaCadeia() {
            const container = document.getElementById('cadeiaContainer');
            if (!container) return;
            const linha = document.createElement('div');
            linha.className = 'cadeia-row';
            linha.setAttribute('data-level', '2');
            linha.innerHTML = '<div class="cadeia-step bg-blue-mid">' +
                '<span class="cadeia-step-titulo" data-editable="true">Nova Linha</span>' +
                '<span class="cadeia-step-sub" data-editable="true">(descrição)</span>' +
                '</div>' +
                '<div class="cadeia-desc" data-editable="true">' +
                '# Texto explicativo #' +
                '</div>';
            container.appendChild(linha);
            aplicarEstadoEditavel();
        }

        /* ================================================
           TOOLBAR FLUTUANTE: INSERIR IMAGEM / LINK
        ================================================ */
        let alvoToolbarEl = null;
        let inserindoImagem = false;

        function posicionarToolbar(el) {
            const toolbar = document.getElementById('editFloatToolbar');
            if (!toolbar || !el) return;
            alvoToolbarEl = el;
            const rect = el.getBoundingClientRect();
            toolbar.style.left = (rect.right + 8) + 'px';
            toolbar.style.top = rect.top + 'px';
            toolbar.classList.add('active');
        }

        function esconderToolbar(e) {
            if (e && e.target && e.target.closest && e.target.closest('#editFloatToolbar')) return;
            setTimeout(() => {
                const toolbar = document.getElementById('editFloatToolbar');
                if (toolbar) { toolbar.classList.remove('active'); }
                alvoToolbarEl = null;
            }, 200);
        }

        function inserirImagemEditavel() {
            if (!alvoToolbarEl) return;
            const url = prompt('Cole a URL da imagem (deixe vazio para fazer upload do computador):');
            if (url && url.trim()) {
                inserirImgNoAlvo(url.trim());
            } else {
                const input = document.getElementById('inputFileImagem');
                input.value = '';
                inserindoImagem = true;
                input.onchange = function () {
                    inserindoImagem = false;
                    const file = this.files && this.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = function (ev) { inserirImgNoAlvo(ev.target.result); };
                    reader.readAsDataURL(file);
                };
                input.oncancel = function () { inserindoImagem = false; };
                input.click();
            }
        }

        function inserirImgNoAlvo(src) {
            if (!alvoToolbarEl || !src) return;
            const img = document.createElement('img');
            img.src = src;
            img.alt = 'Imagem inserida';
            img.style.cssText = 'max-width:120px;max-height:80px;border-radius:4px;cursor:pointer;margin-top:6px;display:block;border:1px solid var(--border-color);';
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const lb = document.getElementById('jornadaLightbox');
                const lbImg = lb ? lb.querySelector('.jornada-lightbox-img') : null;
                if (lbImg) { lbImg.src = src; lb.classList.add('active'); }
            });
            alvoToolbarEl.appendChild(img);
        }

        function inserirLinkEditavel() {
            if (!alvoToolbarEl) return;
            const url = prompt('Cole a URL do link:');
            if (!url || !url.trim()) return;
            const urlFinal = url.trim();
            const sel = window.getSelection();
            const textoSelecionado = sel.toString().trim();
            const a = document.createElement('a');
            a.href = urlFinal;
            a.textContent = textoSelecionado || urlFinal;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.cssText = 'color:#2563eb;text-decoration:underline;';
            const spanUrl = document.createElement('span');
            spanUrl.className = 'link-url-visivel';
            spanUrl.textContent = ' (' + urlFinal + ')';
            if (sel.rangeCount && textoSelecionado) {
                sel.deleteFromDocument();
                sel.getRangeAt(0).insertNode(a);
            } else {
                alvoToolbarEl.appendChild(a);
            }
            a.parentNode.insertBefore(spanUrl, a.nextSibling);
        }

        function capturarTextosEditaveis() {
            const t = {};
            document.querySelectorAll('[data-field]').forEach(el => { t[el.dataset.field] = el.innerHTML; });
            return t;
        }

        function aplicarTextosEditaveis(t) {
            if (!t) return;
            Object.keys(t).forEach(field => {
                const el = document.querySelector(`[data-field="${field}"]`);
                if (el) el.innerHTML = t[field];
            });
        }

        function capturarAtores(forcarExpandido) {
            return Array.from(document.querySelectorAll('#actorsList .actor-row')).map(row => {
                const card = row.querySelector('.actor-card');
                const descDiv = row.querySelector('.actor-description > div');
                const cs = card ? getComputedStyle(card) : null;
                return {
                    key: row.getAttribute('data-actor') || '',
                    cardHTML: card ? card.innerHTML : '',
                    cardBorder: cs ? rgbToHex(cs.borderColor) : '#0070c0',
                    cardColor: cs ? rgbToHex(cs.color) : '#0070c0',
                    bg: rgbToHex(getComputedStyle(row.querySelector('.actor-description')).backgroundColor),
                    descHTML: descDiv ? descDiv.innerHTML : '',
                    expandido: !!(forcarExpandido || row.classList.contains('expandido'))
                };
            });
        }

        function criarLinhaAtorHTML(a) {
            const key = escaparHTML(a.key);
            const clsExp = a.expandido ? ' expandido' : '';
            return `
                <div class="actor-row${clsExp}" data-actor="${key}" title="Duplo clique para focar no Mapa Interativo">
                    <div class="edit-controls">
                        <button class="edit-ctrl-btn color-btn" title="Cor da borda"><input type="color" value="${a.cardBorder}" onchange="mudarCorAtor('${key}','border',this.value)"></button>
                        <button class="edit-ctrl-btn color-btn" title="Cor de fundo"><input type="color" value="${a.bg}" onchange="mudarCorAtor('${key}','bg',this.value)"></button>
                        <button class="edit-ctrl-btn delete" title="Remover ator" onclick="removerAtor(this)">✕</button>
                    </div>
                    <div class="actor-card" contenteditable="false" data-editable="true" style="border-color:${a.cardBorder};color:${a.cardColor};">${a.cardHTML}</div>
                    <div class="actor-description" style="background-color:${a.bg};"><div contenteditable="false" data-editable="true">${a.descHTML}</div></div>
                </div>`;
        }

        function capturarEtapas() {
            const itens = Array.from(document.querySelectorAll('.flow-wrapper .chevron-item')).map(item => ({
                stepKey: item.dataset.step || '',
                cor: item.dataset.color || rgbToHex(getComputedStyle(item).backgroundColor),
                titulo: item.querySelector('.step-title').innerText,
                desc: item.querySelector('.step-desc').innerText,
                img: item.getAttribute('data-img') || ''
            }));
            const barra = document.querySelector('.management-bar');
            const gestao = barra ? {
                cor: barra.dataset.color || rgbToHex(getComputedStyle(barra).backgroundColor),
                titulo: barra.querySelector('.step-title').innerText,
                desc: barra.querySelector('.step-desc').innerText,
                img: barra.getAttribute('data-img') || ''
            } : null;
            return { itens: itens, gestao: gestao };
        }

        function criarEtapaHTML(et) {
            const key = escaparHTML(et.stepKey);
            return `
                <div class="chevron-item" tabindex="0" role="button" style="background-color:${et.cor};" data-step="${key}" data-color="${et.cor}" data-img="${(et.img || '').replace(/"/g, '&quot;')}"
                    onclick="abrirCardDetalhesEl(this)"
                    onkeydown="tratarTeclado3(event, this)">
                    <div class="step-edit-controls">
                        <button class="edit-ctrl-btn color-btn" title="Cor da etapa"><input type="color" value="${et.cor}" onchange="mudarCorEtapa(this,'${key}')"></button>
                        <button class="edit-ctrl-btn delete" title="Remover etapa" onclick="event.stopPropagation();removerEtapa(this)">✕</button>
                    </div>
                    <span class="step-title" contenteditable="false" data-editable="true">${et.titulo}</span>
                    <span class="step-desc" contenteditable="false" data-editable="true">${et.desc}</span>
                </div>`;
        }

        function criarGestaoHTML(g) {
            return `
                <div class="management-bar" tabindex="0" role="button" data-step="gestao" data-color="${g.cor}" style="background-color:${g.cor};" data-img="${(g.img || '').replace(/"/g, '&quot;')}"
                    onclick="abrirCardDetalhesEl(this)"
                    onkeydown="tratarTeclado3(event, this)">
                    <div class="step-edit-controls">
                        <button class="edit-ctrl-btn color-btn" title="Cor da barra"><input type="color" value="${g.cor}" onchange="mudarCorEtapa(this,'gestao')"></button>
                    </div>
                    <span class="step-title" contenteditable="false" data-editable="true">${g.titulo}</span>
                    <span class="step-desc" contenteditable="false" data-editable="true">${g.desc}</span>
                </div>`;
        }

        /* ================================================
           SEÇÃO 3: PRÉVIAS DE IMAGEM + REORDENAR (ARRASTAR)
        ================================================ */
        function anexarPreview(container, item) {
            const imgSrc = item.getAttribute('data-img');
            let preview = item.nextElementSibling;
            const existe = preview && preview.classList.contains('etapa-preview');
            if (!imgSrc) {
                if (existe) preview.style.display = 'none';
                return;
            }
            if (!existe) {
                preview = document.createElement('div');
                preview.className = 'etapa-preview';
                preview.title = 'Clique na imagem para ampliar';
                const img = document.createElement('img');
                img.alt = 'Prévia do fluxo da etapa';
                preview.appendChild(img);
                preview.addEventListener('click', (e) => { e.stopPropagation(); openJornada(e); });
                if (item.nextSibling) container.insertBefore(preview, item.nextSibling);
                else container.appendChild(preview);
            }
            preview.querySelector('img').src = imgSrc;
            preview.style.display = '';
        }

        function instalarPreviewsEtapas() {
            const flow = document.querySelector('.flow-wrapper');
            if (!flow) return;
            // 1) Embrulha cards soltos (ainda sem linha) no próprio lugar
            flow.querySelectorAll('.chevron-item, .management-bar').forEach(card => {
                if (card.closest('.etapa-linha')) return;
                const linha = document.createElement('div');
                linha.className = 'etapa-linha' + (card.classList.contains('management-bar') ? ' etapa-linha-gestao' : '');
                card.parentNode.insertBefore(linha, card);
                linha.appendChild(card);
            });
            // 2) Achata: todas as linhas viram filhas diretas do flow-wrapper (mesmo nível => todas arrastáveis)
            const todasLinhas = Array.from(flow.querySelectorAll('.etapa-linha'));
            todasLinhas.forEach(linha => flow.appendChild(linha));
            // 3) Prévia de imagem ao lado de cada linha
            todasLinhas.forEach(linha => {
                const alvo = linha.querySelector('.chevron-item') || linha.querySelector('.management-bar');
                if (alvo) anexarPreview(linha, alvo);
            });
        }

        function iniciarDragEtapas() {
            const flow = document.querySelector('.flow-wrapper');
            if (!flow || flow.dataset.dragBound) return;
            flow.dataset.dragBound = '1';
            let arrastandoLinha = null, ordemInicial = '';
            const linhas = () => Array.from(flow.querySelectorAll(':scope > .etapa-linha'));
            const ordemAtual = () => linhas().map(l => {
                const el = l.querySelector('.chevron-item') || l.querySelector('.management-bar');
                return el ? (el.dataset.step || '') : '?';
            }).join('|');
            flow.addEventListener('dragstart', (e) => {
                const card = e.target.closest ? e.target.closest('.chevron-item, .management-bar') : null;
                if (!editMode || !card || !flow.contains(card)) { e.preventDefault(); return; }
                arrastandoLinha = card.closest('.etapa-linha');
                ordemInicial = ordemAtual();
                card.classList.add('arrastando');
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', card.dataset.step || 'etapa'); } catch (err) { }
            });
            flow.addEventListener('dragover', (e) => {
                if (!editMode || !arrastandoLinha) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const alvoCard = e.target.closest ? e.target.closest('.chevron-item, .management-bar') : null;
                if (!alvoCard) return;
                const alvoLinha = alvoCard.closest('.etapa-linha');
                if (!alvoLinha || alvoLinha === arrastandoLinha || alvoLinha.parentNode !== flow) return;
                const rect = alvoLinha.getBoundingClientRect();
                const antes = (e.clientY - rect.top) / rect.height < 0.5;
                flow.insertBefore(arrastandoLinha, antes ? alvoLinha : alvoLinha.nextSibling);
            });
            flow.addEventListener('drop', (e) => { if (arrastandoLinha) e.preventDefault(); });
            flow.addEventListener('dragend', () => {
                flow.querySelectorAll('.arrastando').forEach(el => el.classList.remove('arrastando'));
                if (arrastandoLinha && ordemAtual() !== ordemInicial) salvarHistorico();
                arrastandoLinha = null;
            });
        }

        function vincularCliquesAtores() {
            document.querySelectorAll('.actor-row').forEach(row => {
                if (row.dataset.clickBound) return;
                row.dataset.clickBound = '1';
                row.addEventListener('dblclick', (e) => {
                    if (editMode || e.target.closest('.edit-controls') || e.target.closest('[contenteditable]')) return;
                    const actorKey = row.getAttribute('data-actor');
                    if (actorKey) focarAtorNoMapa(actorKey);
                });
            });
        }

        /* ================================================
           ESTADO COMPLETO (COLETAR / APLICAR)
        ================================================ */
        function coletarEstadoCompleto(forcarExpandido) {
            return {
                versao: 2,
                salvoEm: new Date().toISOString(),
                map: state,
                editMode: editMode,
                atores: capturarAtores(forcarExpandido),
                etapas: capturarEtapas(),
                textos: capturarTextosEditaveis()
            };
        }

        function aplicarEstadoCompleto(parsed) {
            if (!parsed || typeof parsed !== 'object') { alert('Dados inválidos.'); return false; }
            const mapa = parsed.map ? parsed.map : parsed;
            if (!mapa || !Array.isArray(mapa.nodes) || !Array.isArray(mapa.conexoes)) { alert('Os dados não são válidos.'); return false; }
            state = mapa;
            nodeSelecionadoId = null;

            if (Array.isArray(parsed.atores) && parsed.atores.length) {
                document.getElementById('actorsList').innerHTML = parsed.atores.map(criarLinhaAtorHTML).join('');
                instalarTogglesAtores();
            }
            if (parsed.etapas && Array.isArray(parsed.etapas.itens) && parsed.etapas.itens.length) {
                // Remove as linhas antigas de etapas (fora da pipeline desde a mudança do arraste)
                const flowEl = document.querySelector('.flow-wrapper');
                if (flowEl) {
                    flowEl.querySelectorAll(':scope > .etapa-linha:not(.etapa-linha-gestao)').forEach(l => l.remove());
                    flowEl.querySelectorAll(':scope > .chevron-item').forEach(c => c.remove());
                }
                document.getElementById('chevronPipeline').innerHTML = parsed.etapas.itens.map(criarEtapaHTML).join('');
                if (parsed.etapas.gestao) {
                    const antiga = document.querySelector('.management-bar');
                    if (antiga) antiga.outerHTML = criarGestaoHTML(parsed.etapas.gestao);
                }
            }
            if (parsed.textos) aplicarTextosEditaveis(parsed.textos);

            aplicarEstadoEditavel();
            vincularCliquesAtores();
            salvarHistorico();
            renderizarMapa();
            selecionarNode(null);
            return true;
        }

        /* ================================================
           SALVAR / RESTAURAR MANUAL (NAVEGADOR)
        ================================================ */
        /* ================================================
           AUTO-SAVE
        ================================================ */
        let autoSaveTimer = null;
        const AUTOSAVE_INTERVAL = 30000; // 30 segundos

        function agendarAutoSave() {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => {
                try {
                    localStorage.setItem(CHAVE_SAVE_MANUAL + '_autosave', JSON.stringify(coletarEstadoCompleto()));
                    mostrarPillAutoSave();
                } catch (err) { /* silencioso */ }
            }, AUTOSAVE_INTERVAL);
        }

        function mostrarPillAutoSave() {
            let pill = document.getElementById('autoSavePill');
            if (!pill) {
                pill = document.createElement('span');
                pill.id = 'autoSavePill';
                pill.className = 'autosave-pill';
                pill.innerHTML = '✅ Auto-salvo';
                const bar = document.getElementById('globalActionsBar');
                if (bar) bar.insertBefore(pill, bar.firstChild);
            }
            pill.style.opacity = '1';
            setTimeout(() => { pill.style.opacity = '0'; }, 2500);
        }

        function tentarRestaurarAutoSave() {
            const data = localStorage.getItem(CHAVE_SAVE_MANUAL + '_autosave');
            if (!data) return false;
            try {
                const parsed = JSON.parse(data);
                return aplicarEstadoCompleto(parsed);
            } catch (err) { return false; }
        }

        const CHAVE_SAVE_MANUAL = 'utfpr_fluxo_estagio';

        function salvarEstadoLocal() {
            try {
                localStorage.setItem(CHAVE_SAVE_MANUAL, JSON.stringify(coletarEstadoCompleto()));
                toast('Trabalho salvo com sucesso!');
            } catch (err) {
                toast('Falha ao salvar: armazenamento do navegador indisponível ou cheio.', 'erro');
            }
        }

        function restaurarEstadoLocal() {
            const data = localStorage.getItem(CHAVE_SAVE_MANUAL);
            if (!data) { alert('Nenhum estado salvo foi encontrado. Use o botão 💾 Salvar primeiro.'); return; }
            let parsed;
            try { parsed = JSON.parse(data); } catch (err) { alert('Os dados salvos estão corrompidos.'); return; }
            if (aplicarEstadoCompleto(parsed)) toast('Estado restaurado!');
        }

        /* ================================================
            NOTIFICAÇÕES (TOASTS)
        ================================================ */
        function toast(msg, tipo = 'ok', acoes = null, duracao = 3500) {
            let container = document.getElementById('toastContainer');
            if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; document.body.appendChild(container); }
            const el = document.createElement('div');
            el.className = 'toast-msg ' + tipo;
            const span = document.createElement('span');
            span.innerText = msg;
            el.appendChild(span);
            (acoes || []).forEach(a => {
                const b = document.createElement('button');
                b.type = 'button'; b.innerText = a.label;
                b.onclick = () => { fecharToast(el); a.fn(); };
                el.appendChild(b);
            });
            container.appendChild(el);
            if (!acoes || !acoes.length) setTimeout(() => fecharToast(el), duracao);
            return el;
        }

        function fecharToast(el) { if (el && el.parentNode) { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); } }

        /* ================================================
           EXPORTAÇÃO — ARQUIVO ÚNICO 100% COMPLETO
           (HTML + CSS + JS + imagens embutidos num só .html)
        ================================================ */

        // Converte imagens locais do clone para data-URL (base64), em <img> e atributos data-img.
        // Em páginas abertas via http(s) ou Firefox/file:// funciona direto;
        // se o navegador bloquear a leitura (Chrome em file://), mantém o caminho original.
        async function embutirImagens(cloneDoc) {
            const cache = new Map();
            function paraDataUrl(src) {
                if (cache.has(src)) return Promise.resolve(cache.get(src));
                return new Promise((resolve) => {
                    const falha = () => resolve(null);
                    try {
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', src, true);
                        xhr.responseType = 'arraybuffer';
                        xhr.onload = () => {
                            try {
                                if (!xhr.response) { falha(); return; }
                                const bytes = new Uint8Array(xhr.response);
                                let bin = '';
                                for (let i = 0; i < bytes.length; i += 8192) {
                                    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
                                }
                                const tipo = /\.jpe?g$/i.test(src) ? 'image/jpeg'
                                    : (/\.gif$/i.test(src) ? 'image/gif'
                                        : (/\.svg$/i.test(src) ? 'image/svg+xml' : 'image/png'));
                                const url = 'data:' + tipo + ';base64,' + btoa(bin);
                                cache.set(src, url);
                                resolve(url);
                            } catch (e) { falha(); }
                        };
                        xhr.onerror = falha;
                        xhr.send(null);
                    } catch (e) { falha(); }
                });
            }
            for (const img of Array.from(cloneDoc.querySelectorAll('img'))) {
                const src = img.getAttribute('src');
                if (!src || src.startsWith('data:') || /^(https?:)?\/\//i.test(src)) continue;
                const url = await paraDataUrl(src);
                if (url) img.setAttribute('src', url);
            }
            for (const el of Array.from(cloneDoc.querySelectorAll('[data-img]'))) {
                const src = el.getAttribute('data-img');
                if (!src || src.startsWith('data:') || /^(https?:)?\/\//i.test(src)) continue;
                const url = await paraDataUrl(src);
                if (url) el.setAttribute('data-img', url);
            }
        }

        // Serializa o CSS do arquivo style.css (via regras já carregadas no navegador — funciona até em file://)
        function coletarCSSLocal() {
            let css = '';
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    const ehLocal = sheet.ownerNode && sheet.ownerNode.tagName === 'LINK' &&
                        (sheet.ownerNode.getAttribute('href') || '') === 'style.css';
                    if (!ehLocal || !sheet.cssRules) return;
                    css += Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
                } catch (err) { /* folha cross-origin: pula */ }
            });
            return css;
        }

        // Tenta ler o texto de script.js (bloqueado no Chrome via file://; funciona em http(s) e Firefox)
        function lerScriptApp() {
            return new Promise((resolve) => {
                const falha = () => resolve(null);
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', 'script.js', true);
                    xhr.onload = () => {
                        if (xhr.responseText) resolve(xhr.responseText);
                        else falha();
                    };
                    xhr.onerror = falha;
                    xhr.send(null);
                } catch (e) { falha(); }
            });
        }

        async function gerarHTMLCompleto() {
            const cloneDoc = document.documentElement.cloneNode(true);

            // Limpa resíduos da sessão atual
            cloneDoc.querySelectorAll('.toast-msg').forEach(el => el.remove());
            cloneDoc.querySelectorAll('.modal-overlay, .lightbox-overlay, .jornada-lightbox').forEach(el => el.classList.remove('active'));
            cloneDoc.querySelectorAll('.map-node.selected, .map-node.connecting-origin').forEach(el => el.classList.remove('selected', 'connecting-origin'));
            const clonedBody = cloneDoc.querySelector('body');
            if (clonedBody) clonedBody.classList.remove('editing');
            cloneDoc.querySelectorAll('[data-editable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));
            const propFormClone = cloneDoc.querySelector('#propForm');
            if (propFormClone) propFormClone.style.display = 'none';

            // Expande todos os atores para que as descrições completas apareçam no arquivo exportado
            expandirTodosAtores(cloneDoc);

            // Embute as imagens locais no próprio arquivo
            await embutirImagens(cloneDoc);

            // CSS: embute o style.css lido das regras carregadas e remove o link externo.
            // Se a leitura falhar (SecurityError no Chrome via file://), mantém o <link>
            // original apontando para style.css para não deixar a página sem nenhuma referência.
            const css = coletarCSSLocal();
            const linkCss = cloneDoc.querySelector('link[rel="stylesheet"][href="style.css"]');
            if (css && linkCss) {
                const styleEl = document.createElement('style');
                styleEl.textContent = css;
                linkCss.replaceWith(styleEl);
            }

            // JS: tenta embutir o script.js; se o navegador bloquear a leitura, mantém a referência externa
            let jsEmbutido = false;
            const jsTexto = await lerScriptApp();
            const scriptTag = cloneDoc.querySelector('script[src="script.js"]');
            if (jsTexto && scriptTag) scriptTag.remove();
            if (jsTexto) {
                const scriptEl = document.createElement('script');
                scriptEl.textContent = jsTexto.replace(/<\/script/gi, '<\\/script');
                clonedBody.appendChild(scriptEl);
                jsEmbutido = true;
            }

            // Estado atual embutido como JSON
            const estadoAntigo = cloneDoc.querySelector('#estadoMapaExportado');
            if (estadoAntigo) estadoAntigo.remove();
            const tagEstado = document.createElement('script');
            tagEstado.type = 'application/json';
            tagEstado.id = 'estadoMapaExportado';
            tagEstado.textContent = JSON.stringify(coletarEstadoCompleto(true)).replace(/<\//g, '<\\/');
            clonedBody.appendChild(tagEstado);

            return { html: "<!DOCTYPE html>\n" + cloneDoc.outerHTML, jsEmbutido: jsEmbutido };
        }

        async function exportarComoHTML() {
            toast('Preparando exportação — embutindo imagens, CSS e JS...', 'info', null, 4000);
            try {
                const resultado = await gerarHTMLCompleto();
                const blob = new Blob([resultado.html], { type: 'text/html;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'processo_estagio_utfpr_' + new Date().toISOString().slice(0, 10) + '.html';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                if (resultado.jsEmbutido) toast('Página completa exportada! HTML + CSS + JS + imagens num único arquivo.');
                else toast('Exportado! Mas este navegador bloqueou a leitura do script.js — envie o .html JUNTO com o script.js e o style.css (ou abra a página pelo Firefox para vir tudo num só).', 'info', null, 10000);
            } catch (err) {
                console.error(err);
                toast('Falha ao exportar a página. Verifique o console para detalhes.', 'erro');
            }
        }

        async function exportarComoPDF() {
            if (typeof html2pdf === 'undefined') {
                toast('Biblioteca html2pdf não foi carregada. Verifique sua conexão com a internet e recarregue a página.', 'erro', null, 8000);
                return;
            }
            const sec1Content = document.getElementById('sec1Content');
            const sec2Content = document.getElementById('sec2Content');
            const sec3Content = document.getElementById('sec3Content');
            const sec1WasHidden = sec1Content && sec1Content.style.display === 'none';
            const sec2WasHidden = sec2Content && sec2Content.style.display === 'none';
            const sec3WasHidden = sec3Content && sec3Content.style.display === 'none';
            if (sec1WasHidden) toggleSection('sec1Content', 'sec1Toggle');
            if (sec2WasHidden) toggleSection('sec2Content', 'sec2Toggle');
            if (sec3WasHidden) toggleSection('sec3Content', 'sec3Toggle');
            const globalBar = document.getElementById('globalActionsBar');
            const toolbar = document.getElementById('editorToolbar');
            const propertiesPanel = document.getElementById('propertiesPanel');
            const searchContainer = document.getElementById('searchContainer');
            const workspace = document.getElementById('editorWorkspace');
            if (globalBar) globalBar.style.display = 'none';
            if (toolbar) toolbar.style.display = 'none';
            if (propertiesPanel) propertiesPanel.style.display = 'none';
            if (searchContainer) searchContainer.style.display = 'none';
            const prevGrid = workspace ? workspace.style.gridTemplateColumns : '';
            if (workspace) workspace.style.gridTemplateColumns = '1fr';
            resetarVisao(); selecionarNode(null);
            // Expande todos os atores para incluir as descrições completas no PDF
            const atoresRows = Array.from(document.querySelectorAll('#actorsList .actor-row'));
            const atoresExpandidosAntes = atoresRows.filter(r => r.classList.contains('expandido'));
            atoresRows.forEach(r => alternarExpansaoAtor(r, true));
            toast('Gerando PDF — isso pode levar alguns segundos...', 'info', null, 6000);
            const options = { margin: [10, 10, 10, 10], filename: 'processo_estagio_utfpr.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } };
            try { await html2pdf().set(options).from(document.getElementById('pageContainer')).save(); toast('PDF exportado com sucesso!'); }
            catch (err) { console.error('Erro ao gerar PDF:', err); toast('Ocorreu um erro ao gerar o PDF. Tente novamente.', 'erro'); }
            finally {
                if (globalBar) globalBar.style.display = 'flex';
                if (toolbar) toolbar.style.display = 'flex';
                if (propertiesPanel) propertiesPanel.style.display = 'flex';
                if (searchContainer) searchContainer.style.display = 'block';
                if (workspace) workspace.style.gridTemplateColumns = prevGrid;
                if (sec1WasHidden) toggleSection('sec1Content', 'sec1Toggle');
                if (sec2WasHidden) toggleSection('sec2Content', 'sec2Toggle');
                if (sec3WasHidden) toggleSection('sec3Content', 'sec3Toggle');
                atoresRows.forEach(r => alternarExpansaoAtor(r, atoresExpandidosAntes.includes(r)));
            }
        }

        function exportarJSON() {
            const dados = coletarEstadoCompleto(true);
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'fluxo_estagio_utfpr_' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        }

        async function exportarComoPacote() {
            if (typeof JSZip === 'undefined') {
                toast('Biblioteca JSZip não foi carregada. Verifique sua conexão com a internet e recarregue a página.', 'erro', null, 8000);
                return;
            }
            toast('Preparando pacote HTML + CSS + JS...', 'info', null, 4000);
            try {
                // Tenta ler CSS/JS direto dos arquivos (funciona em http:// e file:// no Firefox/Chrome)
                let css = '';
                let jsTexto = null;
                try { const r = await fetch('style.css'); if (r.ok) css = await r.text(); } catch (e) {}
                if (!css) css = coletarCSSLocal();
                try { const r = await fetch('script.js'); if (r.ok) jsTexto = await r.text(); } catch (e) {}
                if (!jsTexto) jsTexto = await lerScriptApp();

                // Monta o HTML de referência (sem embutir CSS/JS inline)
                const cloneDoc = document.documentElement.cloneNode(true);
                cloneDoc.querySelectorAll('.toast-msg').forEach(el => el.remove());
                cloneDoc.querySelectorAll('.modal-overlay, .lightbox-overlay, .jornada-lightbox').forEach(el => el.classList.remove('active'));
                cloneDoc.querySelectorAll('.map-node.selected, .map-node.connecting-origin').forEach(el => el.classList.remove('selected', 'connecting-origin'));
                const clonedBody = cloneDoc.querySelector('body');
                if (clonedBody) clonedBody.classList.remove('editing');
                cloneDoc.querySelectorAll('[data-editable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));
                const propFormClone = cloneDoc.querySelector('#propForm');
                if (propFormClone) propFormClone.style.display = 'none';

                // Expande todos os atores para que as descrições completas apareçam no pacote
                expandirTodosAtores(cloneDoc);

                // Embute imagens no HTML
                await embutirImagens(cloneDoc);

                // Reinserir referências aos arquivos separados.
                // As referências originais só são removidas quando o respectivo arquivo
                // pôde ser lido (e, portanto, incluído no ZIP). Se a leitura falhar
                // (Chrome em file://), mantém o <link>/<script> original apontando para
                // o arquivo, para o pacote continuar utilizável.
                const linkCss = cloneDoc.querySelector('link[rel="stylesheet"][href="style.css"]');
                if (css && linkCss) {
                    const novoLink = document.createElement('link');
                    novoLink.rel = 'stylesheet';
                    novoLink.href = 'style.css';
                    linkCss.replaceWith(novoLink);
                }
                const scriptTag = cloneDoc.querySelector('script[src="script.js"]');
                if (jsTexto && scriptTag && clonedBody) {
                    const novoScript = document.createElement('script');
                    novoScript.src = 'script.js';
                    scriptTag.replaceWith(novoScript);
                }

                // Embute estado como JSON
                const estadoAntigo = cloneDoc.querySelector('#estadoMapaExportado');
                if (estadoAntigo) estadoAntigo.remove();
                const tagEstado = document.createElement('script');
                tagEstado.type = 'application/json';
                tagEstado.id = 'estadoMapaExportado';
                tagEstado.textContent = JSON.stringify(coletarEstadoCompleto(true)).replace(/<\//g, '<\\/');
                clonedBody.appendChild(tagEstado);

                const htmlLimpo = "<!DOCTYPE html>\n" + cloneDoc.outerHTML;

                // Monta o ZIP
                const zip = new JSZip();
                zip.file('index.html', htmlLimpo);
                if (css) zip.file('style.css', css);
                if (jsTexto) zip.file('script.js', jsTexto);

                const conteudo = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(conteudo);
                a.download = 'projeto_estagio_utfpr_' + new Date().toISOString().slice(0, 10) + '.zip';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                const faltando = [];
                if (!css) faltando.push('style.css');
                if (!jsTexto) faltando.push('script.js');
                if (faltando.length) {
                    toast('Pacote exportado, mas ' + faltando.join(' e ') + ' NÃO pode(m) ser lido(s) neste navegador (Chrome via file:// bloqueia). Adicione-o(s) manualmente ao .zip ou abra a página pelo Firefox antes de exportar.', 'info', null, 12000);
                } else {
                    toast('Pacote exportado! Descompacte o .zip e abra o index.html no navegador.');
                }
            } catch (err) {
                console.error(err);
                toast('Falha ao exportar o pacote. Verifique o console para detalhes.', 'erro');
            }
        }

        function rgbToHex(rgb) {
            if (!rgb) return '#0070c0';
            if (rgb.startsWith('#')) return rgb;
            if (/^rgba?\(/.test(rgb)) {
                const vals = rgb.match(/\d+/g);
                if (!vals || vals.length < 3) return '#0070c0';
                return "#" + ((1 << 24) + (parseInt(vals[0]) << 16) + (parseInt(vals[1]) << 8) + parseInt(vals[2])).toString(16).slice(1);
            }
            const temp = document.createElement('div');
            temp.style.color = rgb;
            document.body.appendChild(temp);
            const computed = getComputedStyle(temp).color;
            document.body.removeChild(temp);
            const m = computed.match(/\d+/g);
            if (!m || m.length < 3) return '#0070c0';
            return "#" + ((1 << 24) + (parseInt(m[0]) << 16) + (parseInt(m[1]) << 8) + parseInt(m[2])).toString(16).slice(1);
        }

        /* ================================================
           INICIALIZAÇÃO
        ================================================ */
        function carregarEstadoExportado() {
            const tag = document.getElementById('estadoMapaExportado');
            if (!tag) return;
            try {
                const s = JSON.parse(tag.textContent);
                const mapa = s && s.map ? s.map : s; // aceita formato novo (completo) e antigo (só o mapa)
                if (mapa && Array.isArray(mapa.nodes) && Array.isArray(mapa.conexoes)) state = mapa;
            } catch (err) { console.warn('Estado embutido no HTML exportado é inválido:', err); }
        }

        document.addEventListener('DOMContentLoaded', () => {
            // No arquivo exportado (que contém #estadoMapaExportado), o conteúdo embutido
            // deve ter prioridade sobre o auto-save local do navegador, garantindo que o
            // que foi exportado seja exatamente o que aparece ao abrir o arquivo.
            const temEstadoEmbutido = !!document.getElementById('estadoMapaExportado');
            if (temEstadoEmbutido) {
                carregarEstadoExportado();
            } else {
                const restaurouAutoSave = tentarRestaurarAutoSave();
                if (!restaurouAutoSave) carregarEstadoExportado();
            }
            salvarHistorico(); renderizarMapa();
            vincularCliquesAtores();
            instalarTogglesAtores();
            try { iniciarDragEtapas(); } catch (err) { console.error('Arraste das etapas:', err); }
            try { instalarPreviewsEtapas(); } catch (err) { console.error('Prévias das etapas:', err); }

            document.addEventListener('click', (e) => {
                if (!editMode) return;
                const editable = e.target.closest('.chevron-item [contenteditable="true"], .management-bar [contenteditable="true"]');
                if (editable) e.stopPropagation();
            }, true);

            document.addEventListener('focusin', (e) => {
                if (inserindoImagem) return;
                if (!editMode) { esconderToolbar(e); return; }
                const el = e.target.closest('[data-editable="true"]');
                if (el) posicionarToolbar(el);
                else esconderToolbar(e);
            });
            document.addEventListener('focusout', (e) => {
                if (inserindoImagem) return;
                if (!e.target.closest || !e.target.closest('[data-editable="true"]')) esconderToolbar(e);
                agendarAutoSave();
            });

            const canvas = document.getElementById('canvasContainer');
            canvas.addEventListener('mousedown', (e) => {
                if (e.target.id === 'canvasContainer' || e.target.id === 'svgLayer' || e.target.id === 'canvasWorld') {
                    isPanning = true; startPanX = e.clientX - panX; startPanY = e.clientY - panY; selecionarNode(null);
                }
            });
            window.addEventListener('mousemove', (e) => { if (isPanning) { panX = e.clientX - startPanX; panY = e.clientY - startPanY; atualizarTransform(); } });
            window.addEventListener('mouseup', () => isPanning = false);
            canvas.addEventListener('wheel', (e) => { e.preventDefault(); alterarZoom(e.deltaY < 0 ? 0.1 : -0.1); }, { passive: false });

            /* ===== TOUCH SUPPORT ===== */
            let touchStartDist = 0, touchStartZoom = 1;
            let touchStartX = 0, touchStartY = 0;
            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isPanning = true;
                    startPanX = e.touches[0].clientX - panX;
                    startPanY = e.touches[0].clientY - panY;
                } else if (e.touches.length === 2) {
                    isPanning = false;
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    touchStartDist = Math.sqrt(dx * dx + dy * dy);
                    touchStartZoom = zoom;
                }
            }, { passive: true });
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 1 && isPanning) {
                    panX = e.touches[0].clientX - startPanX;
                    panY = e.touches[0].clientY - startPanY;
                    atualizarTransform();
                } else if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    zoom = Math.min(3, Math.max(0.4, touchStartZoom * (dist / touchStartDist)));
                    atualizarTransform();
                }
            }, { passive: false });
            canvas.addEventListener('touchend', () => { isPanning = false; }, { passive: true });

            // Duplo clique no fundo do canvas cria uma caixa no ponto clicado
            canvas.addEventListener('dblclick', (e) => {
                if (!(e.target.id === 'canvasContainer' || e.target.id === 'canvasWorld' || e.target.id === 'nodesContainer')) return;
                const rect = canvas.getBoundingClientRect();
                salvarHistorico();
                const id = gerarId('node');
                state.nodes.push({
                    id, actorId: '', title: 'NOVA ETAPA', sub: 'Descrição',
                    x: Math.round((e.clientX - rect.left - panX) / zoom - 80),
                    y: Math.round((e.clientY - rect.top - panY) / zoom - 35),
                    w: 160, h: 70, bg: '#0070c0', color: '#ffffff'
                });
                renderizarMapa(); selecionarNode(id, false);

            });

            // Atalhos: Ctrl+S salva no navegador · Ctrl+Z/Y desfaz/refaz · Del exclui nó · Esc cancela conexão
            document.addEventListener('keydown', (e) => {
                const k = (e.key || '').toLowerCase();
                if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); salvarEstadoLocal(); return; }
                const alvo = e.target;
                const digitando = alvo.isContentEditable || ['input', 'textarea', 'select'].includes((alvo.tagName || '').toLowerCase());
                if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
                if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); refazer(); return; }
                if (digitando) return;
                if (k === 'delete' && nodeSelecionadoId) excluirSelecionado();
                else if (k === 'escape') {
                    if (modoConexao) cancelarModoConexao();
                    const lb = document.getElementById('jornadaLightbox');
                    if (lb) lb.classList.remove('active');
                }
            });
        });

        /* ================================================
           JORNADA LIGHTBOX
        ================================================ */
        function openJornada(event) {
            event.preventDefault();
            event.stopPropagation();
            const thumb = event.currentTarget.querySelector('img');
            const lightboxImg = document.querySelector('#jornadaLightbox .jornada-lightbox-img');
            if (thumb && lightboxImg) lightboxImg.src = thumb.src;
            document.getElementById('jornadaLightbox').classList.add('active');
        }

        function closeJornada(event) {
            if (event.target === document.getElementById('jornadaLightbox') || event.target.classList.contains('jornada-lightbox-close')) {
                document.getElementById('jornadaLightbox').classList.remove('active');
            }
        }



        /* ================================================
           SEÇÃO 3: MODAL & LIGHTBOX
        ================================================ */
        (function () {
            let imagemAtual3 = '', etapaAtual3 = '';
            let zoomScale3 = 1;
            const minScale3 = 1, maxScale3 = 4.5;
            let isDragging3 = false, didDrag3 = false;
            let startX3 = 0, startY3 = 0, translateX3 = 0, translateY3 = 0;

            window.tratarTeclado3 = function (event, elemento) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elemento.click(); } };

            window.abrirCardDetalhes3 = function (etapa, itensString, corHex, imagemSrc) {
                etapaAtual3 = etapa; imagemAtual3 = imagemSrc;
                document.getElementById('cardTitle3').innerText = etapa;
                document.getElementById('cardHeaderBar3').style.backgroundColor = corHex;
                const badge = document.getElementById('cardBadge3'); badge.style.backgroundColor = corHex; badge.innerText = 'Detalhes da Etapa';
                const tagsContainer = document.getElementById('cardTags3'); tagsContainer.innerHTML = '';
                itensString.split(',').forEach(item => { const tag = document.createElement('span'); tag.className = 'info-tag'; tag.innerText = item.trim(); tagsContainer.appendChild(tag); });
                const imgContainer = document.getElementById('diagramImgContainer3');
                const cardImg = document.getElementById('cardDiagramImg3');
                if (imagemSrc && imagemSrc.trim() !== '') { cardImg.src = imagemSrc; imgContainer.style.display = 'block'; }
                else { imgContainer.style.display = 'none'; }
                document.getElementById('modalCard3').classList.add('active');
            };

            window.abrirCardDetalhesEl = function (el) {
                const tituloEl = el.querySelector('.step-title');
                const descEl = el.querySelector('.step-desc');
                const titulo = tituloEl ? tituloEl.innerText.trim() : '';
                const desc = descEl ? descEl.innerText.trim().replace(/^\(/, '').replace(/\)$/, '') : '';
                const cor = el.dataset.color || rgbToHex(getComputedStyle(el).backgroundColor);
                abrirCardDetalhes3(titulo, desc, cor, el.getAttribute('data-img') || '');
            };

            function aplicarTransform3() {
                const img = document.getElementById('lightboxImg3');
                const scaleText = document.getElementById('zoomScaleText3');
                const viewport = document.getElementById('lightboxViewport3');
                if (img) img.style.transform = `translate(${translateX3}px, ${translateY3}px) scale(${zoomScale3})`;
                if (scaleText) scaleText.innerText = `${Math.round(zoomScale3 * 100)}%`;
                if (viewport) { if (zoomScale3 > 1) viewport.classList.add('zoomed'); else { viewport.classList.remove('zoomed'); translateX3 = 0; translateY3 = 0; } }
            }

            window.zoomIn3 = function () { if (zoomScale3 < maxScale3) { zoomScale3 = Math.min(maxScale3, zoomScale3 + 0.35); aplicarTransform3(); } };
            window.zoomOut3 = function () { if (zoomScale3 > minScale3) { zoomScale3 = Math.max(minScale3, zoomScale3 - 0.35); if (zoomScale3 === 1) { translateX3 = 0; translateY3 = 0; } aplicarTransform3(); } };
            window.resetZoom3 = function () { zoomScale3 = 1; translateX3 = 0; translateY3 = 0; aplicarTransform3(); };

            window.abrirImagemCompleta3 = function () {
                resetZoom3();
                const lightboxImg = document.getElementById('lightboxImg3');
                const lightboxCaption = document.getElementById('lightboxCaption3');
                if (lightboxImg) lightboxImg.src = imagemAtual3;
                if (lightboxCaption) lightboxCaption.innerText = `Mapeamento Completo: ${etapaAtual3}`;
                document.getElementById('lightboxModal3').classList.add('active');
            };

            window.fecharCard3 = function () { document.getElementById('modalCard3').classList.remove('active'); };
            window.fecharCardFora3 = function (event) { if (event.target.id === 'modalCard3') fecharCard3(); };

            window.fecharLightbox3 = function () { document.getElementById('lightboxModal3').classList.remove('active'); resetZoom3(); };
            window.fecharLightboxFora3 = function (event) {
                if (event.target.id === 'lightboxModal3' || event.target.id === 'lightboxViewport3') { if (!didDrag3) fecharLightbox3(); didDrag3 = false; }
            };

            window.tratarErroImagem3 = function (img) { img.onerror = null; img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'; };

            document.addEventListener('DOMContentLoaded', function () {
                const viewport = document.getElementById('lightboxViewport3');
                if (!viewport) return;
                viewport.addEventListener('wheel', function (e) { e.preventDefault(); zoomScale3 = e.deltaY < 0 ? Math.min(maxScale3, zoomScale3 + 0.2) : Math.max(minScale3, zoomScale3 - 0.2); if (zoomScale3 === 1) { translateX3 = 0; translateY3 = 0; } aplicarTransform3(); }, { passive: false });
                viewport.addEventListener('dblclick', function () { if (zoomScale3 > 1) resetZoom3(); else { zoomScale3 = 2; aplicarTransform3(); } });
                viewport.addEventListener('mousedown', function (e) { if (e.target.closest('.lightbox-toolbar')) return; if (zoomScale3 > 1) { isDragging3 = true; didDrag3 = false; startX3 = e.clientX - translateX3; startY3 = e.clientY - translateY3; viewport.classList.add('dragging'); } });
                window.addEventListener('mousemove', function (e) { if (!isDragging3) return; didDrag3 = true; translateX3 = e.clientX - startX3; translateY3 = e.clientY - startY3; aplicarTransform3(); });
                window.addEventListener('mouseup', function () { if (isDragging3) { isDragging3 = false; viewport.classList.remove('dragging'); } });

                /* Touch support for lightbox */
                let lbTouchDist = 0, lbTouchZoom = 1;
                viewport.addEventListener('touchstart', function (e) {
                    if (e.touches.length === 1 && zoomScale3 > 1) {
                        isDragging3 = true; didDrag3 = false;
                        startX3 = e.touches[0].clientX - translateX3;
                        startY3 = e.touches[0].clientY - translateY3;
                    } else if (e.touches.length === 2) {
                        isDragging3 = false;
                        const dx = e.touches[0].clientX - e.touches[1].clientX;
                        const dy = e.touches[0].clientY - e.touches[1].clientY;
                        lbTouchDist = Math.sqrt(dx * dx + dy * dy);
                        lbTouchZoom = zoomScale3;
                    }
                }, { passive: true });
                viewport.addEventListener('touchmove', function (e) {
                    e.preventDefault();
                    if (e.touches.length === 1 && isDragging3) {
                        didDrag3 = true;
                        translateX3 = e.touches[0].clientX - startX3;
                        translateY3 = e.touches[0].clientY - startY3;
                        aplicarTransform3();
                    } else if (e.touches.length === 2) {
                        const dx = e.touches[0].clientX - e.touches[1].clientX;
                        const dy = e.touches[0].clientY - e.touches[1].clientY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        zoomScale3 = Math.min(maxScale3, Math.max(minScale3, lbTouchZoom * (dist / lbTouchDist)));
                        aplicarTransform3();
                    }
                }, { passive: false });
                viewport.addEventListener('touchend', function () { isDragging3 = false; viewport.classList.remove('dragging'); }, { passive: true });
                document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { fecharLightbox3(); fecharCard3(); } });
            });
        })();

        /* ================================================
           NAVEGAÇÃO PROFISSIONAL (MENU / RODAPÉ)
        ================================================ */
        (function () {
            const nav = document.getElementById('siteNav');
            const toggle = document.getElementById('navToggle');
            const menu = document.getElementById('navMenu');
            const links = menu ? Array.from(menu.querySelectorAll('a[href^="#"]')) : [];

            if (toggle && menu) {
                toggle.addEventListener('click', () => {
                    const aberto = menu.classList.toggle('open');
                    toggle.classList.toggle('open', aberto);
                    toggle.setAttribute('aria-expanded', String(aberto));
                });

                // Fecha o menu ao clicar num link (mobile) e dá scroll suave
                menu.addEventListener('click', (e) => {
                    const alvo = e.target.closest('a[href^="#"]');
                    if (!alvo) return;
                    menu.classList.remove('open');
                    toggle.classList.remove('open');
                    toggle.setAttribute('aria-expanded', 'false');
                });
            }

            // Sombra na navbar ao rolar
            if (nav) {
                const aoRolar = () => nav.classList.toggle('scrolled', window.scrollY > 10);
                aoRolar();
                window.addEventListener('scroll', aoRolar, { passive: true });
            }

            // Scroll-spy: marca o link da seção visível
            const secoes = links
                .map(a => document.getElementById(a.dataset.secao))
                .filter(Boolean);

            if ('IntersectionObserver' in window && secoes.length) {
                const spy = new IntersectionObserver((entradas) => {
                    entradas.forEach(entrada => {
                        if (!entrada.isIntersecting) return;
                        const id = entrada.target.id;
                        links.forEach(a => a.classList.toggle('active', a.dataset.secao === id));
                    });
                }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
                secoes.forEach(s => spy.observe(s));
            }

            // Ano do rodapé
            const ano = document.getElementById('footerAno');
            if (ano) ano.textContent = String(new Date().getFullYear());
        })();