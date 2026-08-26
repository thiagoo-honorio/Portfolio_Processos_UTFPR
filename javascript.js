function saveHTML() {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelector('.toolbar')?.remove();
      clone.querySelector('.hint')?.remove();
      const out = '<!DOCTYPE html>\n' + clone.outerHTML;
      const blob = new Blob([out], {type: 'text/html;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'atores_do_processo_editavel.html';
      a.click();
      URL.revokeObjectURL(a.href);
    }

function openJornada(e) {e.preventDefault(); e.stopPropagation(); document.getElementById('jornadaModal').classList.add('open')} function closeJornada(e) {if (e) e.stopPropagation(); document.getElementById('jornadaModal').classList.remove('open')} document.addEventListener('keydown', e => {if (e.key === 'Escape') closeJornada(e)});