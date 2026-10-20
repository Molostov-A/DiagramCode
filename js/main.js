'use strict';
window.DC = window.DC || {};

(function () {
  const state = DC.state;
  const codeEl = document.getElementById('code');
  const statusEl = document.getElementById('status');

  function parseAndRender() {
    const text = codeEl.value;

    try {
      const { classes, nodes, edges, errors } = DC.parseDSL(text);

      state.classes = classes;
      state.nodes = nodes;
      state.edges = edges;

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
    state.classes = {}; state.nodes = {}; state.edges = []; state.selected = null;
    codeEl.value = '';
    DC.render();
  });

  document.getElementById('toggle-code').addEventListener('click', () => {
    const panel = document.getElementById('code-panel');
    const collapsed = panel.classList.toggle('collapsed');
    document.body.classList.toggle('code-collapsed', collapsed);
    const btn = document.getElementById('toggle-code');
    btn.textContent = collapsed ? '»' : '«';
    btn.title = collapsed ? 'Развернуть' : 'Свернуть';
  });

  const EXAMPLE = `start Start
io Ввод: логин и пароль
process Проверка: validate()
decision Корректно? ok?
predef API: authService.login()
decision Успех? token?
process Сохранить: saveSession()
io Ошибка: showError()
end Finish

flow Start.right -> Ввод.left
flow Ввод.right -> Проверка.left
flow Проверка.right -> Корректно.left
flow Корректно.right -> API.left {rect} : да
flow Корректно.bottom -> Ошибка.top {smooth} : нет
flow API.right -> Успех.left
flow Успех.right -> Сохранить.left : да
flow Успех.bottom -> Ошибка.top : нет
flow Сохранить.right -> Finish.left
flow Ошибка.right -> Finish.bottom

# Расположение
layout Start 80 60
layout Ввод 340 60
layout Проверка 600 60
layout Корректно 860 60
layout API 1120 60
layout Успех 1380 60
layout Сохранить 1640 60
layout Ошибка 1640 260
layout Finish 1900 60
`;

  DC.setupInteractions();
  codeEl.value = EXAMPLE;
  parseAndRender();
})();
