'use strict';
window.DC = window.DC || {};

DC.escapeHtml = function (s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
};

DC.renderSpec = function () {
  const container = document.getElementById('spec');
  if (!container) return;
  const state = DC.state;
  const items = [...Object.values(state.classes), ...Object.values(state.nodes)]
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  if (!items.length) {
    container.innerHTML = '<div class="hint">Пусто</div>';
    return;
  }

  const rows = items.map(u => {
    const isClass = u.kind === 'class';
    const type = isClass ? 'class' : u.type;
    const text = isClass
      ? (u.attributes.length || u.methods.length ? `${u.attributes.length} атр. / ${u.methods.length} мет.` : '')
      : (u.text || '');
    const inN = state.edges.filter(e => e.to === u.name).length;
    const outN = state.edges.filter(e => e.from === u.name).length;
    const sel = state.selected?.id === u.name ? ' selected' : '';
    return `<div class="spec-row${sel}" data-kind="${u.kind}" data-name="${DC.escapeHtml(u.name)}">
      <span class="sid">#${u.id}</span>
      <span class="stype">${DC.escapeHtml(type)}</span>
      <span class="sname">${DC.escapeHtml(u.name)}</span>
      <span class="stext">${DC.escapeHtml(text)}</span>
      <span class="stype" title="входящие / исходящие">${inN}↓ ${outN}↑</span>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="spec-section">
    <h6>Блоки (${items.length})</h6>
    ${rows}
  </div>
  ${renderSpecEdges()}`;

  container.querySelectorAll('.spec-row[data-kind]').forEach(row => {
    row.addEventListener('click', () => {
      state.selected = { kind: row.dataset.kind, id: row.dataset.name };
      DC.render();
    });
  });
  container.querySelectorAll('.spec-row[data-edge-idx]').forEach(row => {
    row.addEventListener('click', () => {
      state.selected = { kind: 'edge', id: parseInt(row.dataset.edgeIdx) };
      DC.render();
    });
  });
};

DC.renderStyleEditor = function () {
  const container = document.getElementById('style-editor');
  if (!container) return;
  if (!DC.state.theme) DC.state.theme = {};
  const t = DC.state.theme;

  container.innerHTML = `
    <label class="chk"><input type="checkbox" id="theme-palette" ${t.paletteMode ? 'checked' : ''}> Режим палитры (уникальный цвет обводки)</label>
    <div class="style-sec">Блоки</div>
    ${colorRow('Заливка', 'fill', t.fill)}
    ${colorRow('Обводка', 'stroke', t.stroke)}
    ${numRow('Толщина обводки', 'strokeWidth', t.strokeWidth, 0.5)}
    <div class="style-sec">Текст</div>
    ${colorRow('Цвет текста', 'textColor', t.textColor)}
    ${numRow('Размер', 'fontSize', t.fontSize, 1)}
    <div class="prop-group">
      <label>Гарнитура</label>
      <select data-theme="fontFamily">
        <option value="" ${!t.fontFamily ? 'selected' : ''}>по умолчанию</option>
        <option value="mono" ${t.fontFamily === 'mono' ? 'selected' : ''}>моноширинная</option>
        <option value="sans" ${t.fontFamily === 'sans' ? 'selected' : ''}>без засечек</option>
        <option value="serif" ${t.fontFamily === 'serif' ? 'selected' : ''}>с засечками</option>
      </select>
    </div>
    <label class="chk"><input type="checkbox" id="theme-bold" ${t.bold ? 'checked' : ''}> Жирный текст</label>
    <div class="style-sec">Связи</div>
    ${colorRow('Цвет линий', 'edgeColor', t.edgeColor)}
    ${numRow('Толщина', 'edgeWidth', t.edgeWidth, 0.5)}
    <div class="prop-group">
      <label>Штрих</label>
      <select data-theme="edgeDashed">
        <option value="" ${!t.edgeDashed ? 'selected' : ''}>по типу связи</option>
        <option value="solid" ${t.edgeDashed === 'solid' ? 'selected' : ''}>сплошные</option>
        <option value="dashed" ${t.edgeDashed === 'dashed' ? 'selected' : ''}>пунктир</option>
      </select>
    </div>
    <div class="style-sec">Палитра</div>
    <div class="palette-strip">${DC.PALETTE.map(c => `<i style="background:${c}"></i>`).join('')}</div>
    <button class="prop-delete" id="theme-reset">Сбросить оформление</button>
  `;

  document.getElementById('theme-palette').onchange = e => {
    t.paletteMode = e.target.checked;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('theme-bold').onchange = e => {
    t.bold = e.target.checked;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('theme-reset').onclick = () => {
    DC.state.theme = DC.defaultTheme();
    Object.values(DC.state.classes).forEach(c => c.style = null);
    Object.values(DC.state.nodes).forEach(n => n.style = null);
    DC.state.edges.forEach(e => e.style = null);
    DC.updateCodeFromState();
    DC.render();
    DC.renderStyleEditor();
  };
  bindStyleInputs(container, t, 'theme');
};

function colorRow(label, key, val) {
  return `<div class="prop-group style-row">
    <label>${label}</label>
    <input type="color" class="style-color" data-style="${key}" value="${val || '#cdd6f4'}" ${val ? '' : 'data-auto="1"'} title="${val ? val : 'по умолчанию'} — клик для своего цвета, ✕ чтобы вернуть" />
    <button type="button" class="style-reset" data-style-reset="${key}" title="Вернуть значение по умолчанию">✕</button>
  </div>`;
}

function numRow(label, key, val, step) {
  return `<div class="prop-group style-row">
    <label>${label}</label>
    <input type="number" class="style-num" data-style="${key}" value="${val ?? ''}" step="${step}" placeholder="авто" min="0" />
    <button type="button" class="style-reset" data-style-reset="${key}" title="Вернуть значение по умолчанию">✕</button>
  </div>`;
}

function bindStyleInputs(root, target, prefix) {
  root.querySelectorAll('.style-color').forEach(inp => {
    inp.onclick = () => { if (inp.dataset.auto) inp.removeAttribute('data-auto'); };
    inp.oninput = () => {
      target[inp.dataset.style] = inp.value;
      inp.removeAttribute('data-auto');
      inp.title = inp.value;
      DC.updateCodeFromState();
      DC.render();
    };
  });
  root.querySelectorAll('.style-num').forEach(inp => {
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v)) target[inp.dataset.style] = v;
      else delete target[inp.dataset.style];
      DC.updateCodeFromState();
      DC.render();
    };
  });
  root.querySelectorAll('select[data-theme]').forEach(sel => {
    sel.onchange = () => {
      target[sel.dataset.theme] = sel.value || null;
      DC.updateCodeFromState();
      DC.render();
    };
  });
  root.querySelectorAll('[data-style-reset]').forEach(btn => {
    btn.onclick = () => {
      delete target[btn.dataset.styleReset];
      DC.updateCodeFromState();
      DC.render();
      if (prefix === 'theme') DC.renderStyleEditor();
      else DC.renderProperties();
    };
  });
}

function elementStyleSection(style, hasColor) {
  style = style || {};
  const rows = [];
  if (hasColor) {
    rows.push(colorRow('Заливка', 'fill', style.fill));
    rows.push(colorRow('Обводка', 'stroke', style.stroke));
    rows.push(numRow('Толщина обводки', 'strokeWidth', style.strokeWidth, 0.5));
  } else {
    rows.push(colorRow('Цвет линии', 'color', style.color));
    rows.push(numRow('Толщина', 'strokeWidth', style.strokeWidth, 0.5));
    rows.push(`<div class="prop-group">
      <label>Штрих</label>
      <select data-el-style="dashed">
        <option value="" ${!style.dashed ? 'selected' : ''}>по теме</option>
        <option value="solid" ${style.dashed === 'solid' ? 'selected' : ''}>сплошная</option>
        <option value="dashed" ${style.dashed === 'dashed' ? 'selected' : ''}>пунктир</option>
      </select>
    </div>`);
  }
  rows.push(colorRow('Цвет текста', 'textColor', style.textColor));
  rows.push(numRow('Размер текста', 'fontSize', style.fontSize, 1));
  rows.push(`<div class="prop-group">
    <label>Гарнитура</label>
    <select data-el-style="fontFamily">
      <option value="" ${!style.fontFamily ? 'selected' : ''}>по теме</option>
      <option value="mono" ${style.fontFamily === 'mono' ? 'selected' : ''}>моноширинная</option>
      <option value="sans" ${style.fontFamily === 'sans' ? 'selected' : ''}>без засечек</option>
      <option value="serif" ${style.fontFamily === 'serif' ? 'selected' : ''}>с засечками</option>
    </select>
  </div>
  <label class="chk"><input type="checkbox" data-el-bold ${style.bold ? 'checked' : ''}> Жирный текст</label>`);
  rows.push(`<button type="button" class="prop-delete" data-el-style-reset>Сбросить стиль</button>`);
  return `<div class="style-sec">Стиль элемента</div>${rows.join('')}`;
}

function bindElementStyle(getObj, hasColor) {
  const container = document.getElementById('properties');
  const ensure = () => { const o = getObj(); if (!o.style) o.style = {}; return o; };
  const doRender = () => { DC.updateCodeFromState(); DC.render(); };
  container.querySelectorAll('.style-color').forEach(inp => {
    inp.onclick = () => { if (inp.dataset.auto) inp.removeAttribute('data-auto'); };
    inp.oninput = () => { ensure().style[inp.dataset.style] = inp.value; inp.removeAttribute('data-auto'); doRender(); };
  });
  container.querySelectorAll('.style-num').forEach(inp => {
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      const o = ensure();
      if (Number.isFinite(v)) o.style[inp.dataset.style] = v;
      else delete o.style[inp.dataset.style];
      doRender();
    };
  });
  container.querySelectorAll('select[data-el-style]').forEach(sel => {
    sel.onchange = () => {
      const o = ensure();
      if (sel.value) o.style[sel.dataset.elStyle] = sel.value;
      else delete o.style[sel.dataset.elStyle];
      doRender();
    };
  });
  container.querySelectorAll('[data-el-bold]').forEach(chk => {
    chk.onchange = () => {
      const o = ensure();
      if (chk.checked) o.style.bold = true;
      else delete o.style.bold;
      doRender();
    };
  });
  container.querySelectorAll('[data-el-style-reset]').forEach(btn => {
    btn.onclick = () => { getObj().style = null; DC.updateCodeFromState(); DC.render(); DC.renderProperties(); };
  });
}

function renderSpecEdges() {
  const state = DC.state;
  const all = { ...state.classes, ...state.nodes };
  const edges = state.edges
    .map((ed, idx) => ({ ed, idx }))
    .filter(({ ed }) => all[ed.from] && all[ed.to]);
  if (!edges.length) return '';

  const rows = edges.map(({ ed, idx }) => {
    const a = all[ed.from], b = all[ed.to];
    const sides = (ed.fromSide || ed.toSide)
      ? `${ed.fromSide || 'авто'}→${ed.toSide || 'авто'}`
      : '';
    const meta = [ed.type, ed.label, ed.route, sides].filter(Boolean).join(' · ');
    const selected = state.selected?.kind === 'edge' && state.selected.id === idx ? ' selected' : '';
    const arrow = ed.type === 'flow' || ed.type === 'flowDashed' ? '→' : '—';
    return `<div class="spec-row${selected}" data-edge-idx="${idx}">
      <span class="sid">#${a.id}</span>
      <span class="sname">${DC.escapeHtml(a.name)}</span>
      <span class="stype">${arrow}</span>
      <span class="sid">#${b.id}</span>
      <span class="sname">${DC.escapeHtml(b.name)}</span>
      <span class="stext">${DC.escapeHtml(meta)}</span>
    </div>`;
  }).join('');

  return `<div class="spec-section">
    <h6>Связи (${edges.length})</h6>
    ${rows}
  </div>`;
}

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
        <label>ID</label>
        <input value="#${cls.id}" disabled />
      </div>
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
      ${elementStyleSection(cls.style, true)}
      <button class="prop-delete" id="prop-delete">Удалить класс</button>
    `;
    bindClassProps(cls);
    bindElementStyle(() => state.classes[cls.name], true);
  }

  if (kind === 'node') {
    const node = state.nodes[id];
    if (!node) return container.innerHTML = '<div class="hint">не найдено</div>';
    container.innerHTML = `
      <div class="prop-group">
        <label>ID</label>
        <input value="#${node.id}" disabled />
      </div>
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
      ${elementStyleSection(node.style, true)}
      <button class="prop-delete" id="prop-delete">Удалить узел</button>
    `;
    bindNodeProps(node);
    bindElementStyle(() => state.nodes[node.name], true);
  }

  if (kind === 'edge') {
    const ed = state.edges[id];
    if (!ed) return container.innerHTML = '<div class="hint">не найдено</div>';
    const edgeTypes = ['flow','flowDashed','assoc','dependency','inherit','composition','aggregation','link'];
    const sideOptions = (selected) => ['', 'top', 'right', 'bottom', 'left']
      .map(s => `<option value="${s}" ${s === (selected || '') ? 'selected' : ''}>${s || 'авто'}</option>`)
      .join('');
    container.innerHTML = `
      <div class="prop-group">
        <label>Из</label>
        <input value="${DC.escapeHtml(ed.from)}" disabled />
      </div>
      <div class="prop-group">
        <label>Сторона источника</label>
        <select id="prop-from-side">${sideOptions(ed.fromSide)}</select>
      </div>
      <div class="prop-group">
        <label>В</label>
        <input value="${DC.escapeHtml(ed.to)}" disabled />
      </div>
      <div class="prop-group">
        <label>Сторона цели</label>
        <select id="prop-to-side">${sideOptions(ed.toSide)}</select>
      </div>
      <div class="prop-group">
        <label>Тип связи</label>
        <select id="prop-edge-type">
          ${edgeTypes.map(t => `<option value="${t}" ${t===ed.type?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="prop-group">
        <label>Маршрут линии</label>
        <select id="prop-edge-route">
          <option value="" ${!ed.route?'selected':''}>авто</option>
          <option value="polyline" ${ed.route==='polyline'?'selected':''}>ломаная</option>
          <option value="smooth" ${ed.route==='smooth'?'selected':''}>сглаженная</option>
          <option value="rect" ${ed.route==='rect'?'selected':''}>прямоугольная</option>
        </select>
      </div>
      <div class="prop-group">
        <label>Подпись</label>
        <input id="prop-edge-label" value="${DC.escapeHtml(ed.label)}" placeholder="например: да / нет" />
      </div>
      <button class="prop-reverse" id="prop-edge-reverse" title="Поменять местами источника и цель">⇄ Поменять направление</button>
      ${elementStyleSection(ed.style, false)}
      <button class="prop-delete" id="prop-edge-reset">Сбросить настройки</button>
      <button class="prop-delete" id="prop-delete">Удалить связь</button>
    `;
    bindEdgeProps(ed);
    bindElementStyle(() => state.edges[state.selected.id], false);
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
  document.getElementById('prop-from-side').onchange = e => {
    ed.fromSide = e.target.value || null;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-to-side').onchange = e => {
    ed.toSide = e.target.value || null;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-edge-type').onchange = e => {
    ed.type = e.target.value;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-edge-route').onchange = e => {
    ed.route = e.target.value || null;
    ed.pts = null;
    ed.ptsCustom = false;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-edge-label').oninput = e => {
    ed.label = e.target.value;
    DC.updateCodeFromState();
    DC.render();
  };
  document.getElementById('prop-edge-reverse').onclick = () => {
    const tmp = ed.from, tmpSide = ed.fromSide;
    ed.from = ed.to; ed.fromSide = ed.toSide;
    ed.to = tmp; ed.toSide = tmpSide;
    ed.pts = null;
    DC.updateCodeFromState();
    DC.render();
    DC.renderProperties();
  };
  document.getElementById('prop-edge-reset').onclick = () => {
    ed.fromSide = null;
    ed.toSide = null;
    ed.route = null;
    ed.pts = null;
    ed.ptsCustom = false;
    DC.updateCodeFromState();
    DC.render();
    DC.renderProperties();
  };
  document.getElementById('prop-delete').onclick = () => {
    const idx = state.edges.indexOf(ed);
    if (idx >= 0) state.edges.splice(idx, 1);
    state.selected = null;
    DC.updateCodeFromState();
    DC.render();
  };
}
