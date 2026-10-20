'use strict';
window.DC = window.DC || {};

(function () {
  const state = DC.state;
  const codeEl = document.getElementById('code');
  const statusEl = document.getElementById('status');

  function snapshotStyles() {
    const unit = {};
    [...Object.values(DC.state.classes), ...Object.values(DC.state.nodes)].forEach(u => {
      if (u.id && u.style) unit['u' + u.id] = u.style;
    });
    DC.state.edges.forEach(ed => {
      if (ed.style) {
        const k = `e${ed.from}>${ed.to}`;
        unit[k] = unit[k] || [];
        unit[k].push({ style: ed.style, type: ed.type, label: ed.label, fromSide: ed.fromSide, toSide: ed.toSide });
      }
    });
    return unit;
  }

  function restoreStyles(unit) {
    [...Object.values(DC.state.classes), ...Object.values(DC.state.nodes)].forEach(u => {
      const s = unit['u' + u.id];
      if (s) u.style = s;
    });
    DC.state.edges.forEach(ed => {
      const list = unit[`e${ed.from}>${ed.to}`];
      if (!list || !list.length) return;
      const exact = list.find(s => s.type === ed.type && s.label === ed.label
        && s.fromSide === ed.fromSide && s.toSide === ed.toSide) || list[0];
      ed.style = exact.style;
      list.splice(list.indexOf(exact), 1);
    });
  }

  function parseAndRender() {
    const text = codeEl.value;

    try {
      const prevStyles = snapshotStyles();
      const { classes, nodes, edges, errors, lastId } = DC.parseDSL(text);

      state.classes = classes;
      state.nodes = nodes;
      state.edges = edges;
      state.lastId = Math.max(state.lastId || 0, lastId || 0);
      restoreStyles(prevStyles);

      if (errors.length) {
        statusEl.textContent = `⚠ ${errors.length}`;
        statusEl.className = 'status err';
        statusEl.title = errors.join('\n');
      } else {
        statusEl.textContent = '✓ OK';
        statusEl.className = 'status';
        statusEl.title = '';
      }
      DC.render();
    } catch (err) {
      statusEl.textContent = '✗';
      statusEl.className = 'status err';
      console.error(err);
    }
  }

  let syncTimeout = null;
  codeEl.addEventListener('input', () => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => parseAndRender(), 250);
  });

  document.getElementById('btn-format').addEventListener('click', () => {
    DC.updateCodeFromState();
    parseAndRender();
  });

  document.getElementById('btn-layout').addEventListener('click', () => {
    DC.autoLayout(state.classes, state.nodes, state.edges);
    DC.updateCodeFromState();
    DC.render();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    DC.exportJSON();
  });

  const importFile = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => {
    importFile.click();
  });
  importFile.addEventListener('change', () => {
    if (importFile.files[0]) DC.importJSON(importFile.files[0]);
    importFile.value = '';
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Очистить всё?')) return;
    state.classes = {}; state.nodes = {}; state.edges = []; state.selected = null; state.lastId = 0;
    state.theme = DC.defaultTheme();
    codeEl.value = '';
    DC.render();
  });

  document.getElementById('btn-clear-canvas').addEventListener('click', () => {
    if (!confirm('Очистить холст?')) return;
    state.classes = {}; state.nodes = {}; state.edges = []; state.selected = null; state.lastId = 0;
    codeEl.value = '';
    DC.render();
  });

  document.getElementById('toggle-code').addEventListener('click', () => {
    const panel = document.getElementById('code-panel');
    const collapsed = panel.classList.toggle('collapsed');
    document.body.classList.toggle('code-collapsed', collapsed);
    if (collapsed) document.body.style.gridTemplateColumns = '';
    const btn = document.getElementById('toggle-code');
    btn.textContent = collapsed ? '»' : '«';
    btn.title = collapsed ? 'Развернуть' : 'Свернуть';
  });

  document.getElementById('toggle-spec').addEventListener('click', () => {
    const panel = document.getElementById('spec-panel');
    const collapsed = panel.classList.toggle('collapsed');
    const btn = document.getElementById('toggle-spec');
    btn.textContent = collapsed ? '▸' : '▾';
    btn.title = collapsed ? 'Развернуть' : 'Свернуть';
  });

  document.getElementById('toggle-style').addEventListener('click', () => {
    const panel = document.getElementById('style-panel');
    if (panel.classList.contains('locked')) return;
    const collapsed = panel.classList.toggle('collapsed');
    DC._styleUserCollapsed = collapsed;
    const btn = document.getElementById('toggle-style');
    btn.textContent = collapsed ? '▸' : '▾';
    btn.title = collapsed ? 'Развернуть' : 'Свернуть';
  });

  // --- мобильные накладные панели ---
  const backdrop = document.getElementById('backdrop');
  const overlayIds = ['palette-panel', 'code-panel', 'right-column'];

  function closeOverlays() {
    overlayIds.forEach(id => document.getElementById(id)?.classList.remove('open'));
    backdrop?.classList.remove('show');
  }

  document.querySelectorAll('#mobile-bar [data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.panel);
      const willOpen = !panel.classList.contains('open');
      closeOverlays();
      if (!willOpen) return;
      panel.classList.add('open');
      backdrop.classList.add('show');
      if (panel.id === 'code-panel') {
        panel.classList.remove('collapsed');
        document.body.classList.remove('code-collapsed');
      }
    });
  });
  backdrop.addEventListener('click', closeOverlays);
  document.getElementById('m-zoom-in').addEventListener('click', () => DC.zoomBy(1.3));
  document.getElementById('m-zoom-out').addEventListener('click', () => DC.zoomBy(1 / 1.3));

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeOverlays();
  });

  const EXAMPLE = `start #1 Start
io #2 Ввод: логин и пароль
process #3 Проверка: validate()
decision #4 Корректно? ok?
predef #5 API: authService.login()
decision #6 Успех? token?
process #7 Сохранить: saveSession()
io #8 Ошибка: showError()
end #9 Finish

flow #1.right -> #2.left
flow #2.right -> #3.left
flow #3.right -> #4.left
flow #4.right -> #5.left {rect} : да
flow #4.bottom -> #8.top {smooth} : нет
flow #5.right -> #6.left
flow #6.right -> #7.left : да
flow #6.bottom -> #8.top : нет
flow #7.right -> #9.left
flow #8.right -> #9.bottom

# Расположение
layout #1 80 60
layout #2 340 60
layout #3 600 60
layout #4 860 60
layout #5 1120 60
layout #6 1380 60
layout #7 1640 60
layout #8 1640 260
layout #9 1900 60
`;

  DC.setupInteractions();
  codeEl.value = EXAMPLE;
  parseAndRender();
  DC.updateCodeFromState();
  parseAndRender();
})();
