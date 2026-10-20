'use strict';
window.DC = window.DC || {};

DC.escapeHtml = function (s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
};

DC.renderProperties = function () {
  const container = document.getElementById('properties');
  const state = DC.state;

  if (!state.selected) {
    container.innerHTML = '<div class="hint">Выберите узел или связь на холсте</div>';
    return;
  }

  const { kind, id } = state.selected;

  if (kind === 'class') {
    const cls = state.classes[id];
    if (!cls) return container.innerHTML = '<div class="hint">не найдено</div>';
    container.innerHTML = `
      <div class="prop-group">
        <label>Имя класса</label>
        <input id="prop-name" value="${DC.escapeHtml(cls.name)}" />
      </div>
      <div class="prop-group">
        <label>Стереотип</label>
        <input id="prop-stereotype" value="${DC.escapeHtml(cls.stereotype)}" placeholder="entity / service / interface..." />
      </div>
      <div class="prop-group">
        <label>Атрибуты (по одному на строку)</label>
        <textarea id="prop-attrs" class="members">${DC.escapeHtml(cls.attributes.join('\n'))}</textarea>
      </div>
      <div class="prop-group">
        <label>Методы (по одному на строку)</label>
        <textarea id="prop-methods" class="members">${DC.escapeHtml(cls.methods.join('\n'))}</textarea>
      </div>
      <button class="prop-delete" id="prop-delete">Удалить класс</button>
    `;
    bindClassProps(cls);
  }

  if (kind === 'node') {
    const node = state.nodes[id];
    if (!node) return container.innerHTML = '<div class="hint">не найдено</div>';
    container.innerHTML = `
      <div class="prop-group">
        <label>Тип узла</label>
        <select id="prop-type">
          ${DC.FLOW_KEYWORDS.map(k => `<option value="${k}" ${k===node.type?'selected':''}>${k}</option>`).join('')}
        </select>
      </div>
      <div class="prop-group">
        <label>Имя (ID)</label>
        <input id="prop-name" value="${DC.escapeHtml(node.name)}" />
      </div>
      <div class="prop-group">
        <label>Содержимое</label>
        <input id="prop-text" value="${DC.escapeHtml(node.text)}" placeholder="текст внутри" />
      </div>
      <button class="prop-delete" id="prop-delete">Удалить узел</button>
    `;
    bindNodeProps(node);
  }

  if (kind === 'edge') {
    const ed = state.edges[id];
    if (!ed) return container.innerHTML = '<div class="hint">не найдено</div>';
    const edgeTypes = ['flow','flowDashed','assoc','dependency','inherit','composition','aggregation','link'];
    container.innerHTML = `
      <div class="prop-group">
        <label>Из</label>
        <input value="${DC.escapeHtml(ed.from)}" disabled />
      </div>
      <div class="prop-group">
        <label>В</label>
        <input value="${DC.escapeHtml(ed.to)}" disabled />
      </div>
      <div class="prop-group">
        <label>Тип связи</label>
        <select id="prop-edge-type">
          ${edgeTypes.map(t => `<option value="${t}" ${t===ed.type?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="prop-group">
        <label>Подпись</label>
        <input id="prop-edge-label" value="${DC.escapeHtml(ed.label)}" placeholder="например: да / нет" />
      </div>
      <button class="prop-delete" id="prop-delete">Удалить связь</button>
    `;
    bindEdgeProps(ed);
  }
};

function bindClassProps(cls) {
  const state = DC.state;
  document.getElementById('prop-name').oninput = e => {
    const newName = e.target.value.trim();
    if (!newName || newName === cls.name) return;
    if (state.classes[newName]) return;
    const oldName = cls.name;
    delete state.classes[oldName];
    cls.name = newName;
    state.classes[newName] = cls;
    state.edges.forEach(ed => {
      if (ed.from === oldName) ed.from = newName;
      if (ed.to === oldName) ed.to = newName;
    });
    state.selected.id = newName;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-stereotype').oninput = e => {
    cls.stereotype = e.target.value.trim();
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-attrs').oninput = e => {
    cls.attributes = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-methods').oninput = e => {
    cls.methods = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-delete').onclick = () => {
    delete state.classes[cls.name];
    state.edges = state.edges.filter(ed => ed.from !== cls.name && ed.to !== cls.name);
    state.selected = null;
    DC.updateCodeFromState();
    DC.render();
  };
}

function bindNodeProps(node) {
  const state = DC.state;
  document.getElementById('prop-type').onchange = e => {
    node.type = e.target.value;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-name').oninput = e => {
    const newName = e.target.value.trim();
    if (!newName || newName === node.name) return;
    if (state.nodes[newName] || state.classes[newName]) return;
    const oldName = node.name;
    delete state.nodes[oldName];
    node.name = newName;
    state.nodes[newName] = node;
    state.edges.forEach(ed => {
      if (ed.from === oldName) ed.from = newName;
      if (ed.to === oldName) ed.to = newName;
    });
    state.selected.id = newName;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-text').oninput = e => {
    node.text = e.target.value;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-delete').onclick = () => {
    delete state.nodes[node.name];
    state.edges = state.edges.filter(ed => ed.from !== node.name && ed.to !== node.name);
    state.selected = null;
    DC.updateCodeFromState();
    DC.render();
  };
}

function bindEdgeProps(ed) {
  const state = DC.state;
  document.getElementById('prop-edge-type').onchange = e => {
    ed.type = e.target.value;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-edge-label').oninput = e => {
    ed.label = e.target.value;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-delete').onclick = () => {
    const idx = state.edges.indexOf(ed);
    if (idx >= 0) state.edges.splice(idx, 1);
    state.selected = null;
    DC.updateCodeFromState();
    DC.render();
  };
}
