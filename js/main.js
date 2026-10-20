'use strict';
window.DC = window.DC || {};

(function () {
  const state = DC.state;
  const codeEl = document.getElementById('code');
  const statusEl = document.getElementById('status');

  function parseAndRender(preservePositions = true) {
    const text = codeEl.value;
    const oldClasses = state.classes;
    const oldNodes = state.nodes;

    try {
      const { classes, nodes, edges, errors } = DC.parseDSL(text);

      if (preservePositions) {
        Object.keys(classes).forEach(n => {
          if (oldClasses[n]) { classes[n].x = oldClasses[n].x; classes[n].y = oldClasses[n].y; }
        });
        Object.keys(nodes).forEach(n => {
          if (oldNodes[n]) { nodes[n].x = oldNodes[n].x; nodes[n].y = oldNodes[n].y; }
        });
      }

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
    syncTimeout = setTimeout(() => parseAndRender(true), 250);
  });

  document.getElementById('btn-format').addEventListener('click', () => {
    DC.updateCodeFromState();
    parseAndRender(false);
  });

  document.getElementById('btn-layout').addEventListener('click', () => {
    DC.autoLayout(state.classes, state.nodes, state.edges);
    DC.render();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Очистить всё?')) return;
    state.classes = {}; state.nodes = {}; state.edges = []; state.selected = null;
    codeEl.value = '';
    DC.render();
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

flow Start -> Ввод
flow Ввод -> Проверка
flow Проверка -> Корректно
flow Корректно -> API : да
flow Корректно -> Ошибка : нет
flow API -> Успех
flow Успех -> Сохранить : да
flow Успех -> Ошибка : нет
flow Сохранить -> Finish
flow Ошибка -> Finish
`;

  DC.setupInteractions();
  codeEl.value = EXAMPLE;
  parseAndRender(false);
})();
