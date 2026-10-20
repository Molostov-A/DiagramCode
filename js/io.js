'use strict';
window.DC = window.DC || {};

(function () {
  const state = DC.state;

  function stripNode(n) {
    const out = { id: n.id, kind: n.kind, name: n.name, x: Math.round(n.x), y: Math.round(n.y) };
    if (n.kind === 'class') {
      out.stereotype = n.stereotype || '';
      out.attributes = n.attributes || [];
      out.methods = n.methods || [];
    } else {
      out.type = n.type;
      out.text = n.text || '';
    }
    return out;
  }

  function exportJSON() {
    const data = {
      format: 'DiagramCode',
      version: 2,
      lastId: state.lastId,
      classes: Object.values(state.classes).map(stripNode),
      nodes: Object.values(state.nodes).map(stripNode),
      edges: state.edges.map(ed => ({
        from: ed.from, fromSide: ed.fromSide || null,
        to: ed.to, toSide: ed.toSide || null,
        type: ed.type, route: ed.route || null,
        pts: ed.ptsCustom && ed.pts ? ed.pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) : null,
        label: ed.label || ''
      }))
    };

    const name = prompt('Имя файла:', suggestedName());
    if (name === null) return;
    const filename = (name.trim() || suggestedName()) + '.json';

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function suggestedName() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `DiagramCode_${String(d.getFullYear()).slice(2)}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch {
        alert('Файл не является корректным JSON');
        return;
      }
      if (data.format !== 'DiagramCode' || !Array.isArray(data.classes) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        alert('Неизвестный формат файла');
        return;
      }

      const classes = {}, nodes = {};
      let maxId = 0;
      const nextId = () => {
        const v = ++maxId;
        return v;
      };
      data.classes.forEach(c => {
        if (!c.name) return;
        const id = Number.isInteger(c.id) ? c.id : nextId();
        if (id > maxId) maxId = id;
        classes[c.name] = {
          kind: 'class', id, name: c.name, stereotype: c.stereotype || '',
          attributes: Array.isArray(c.attributes) ? c.attributes : [],
          methods: Array.isArray(c.methods) ? c.methods : [],
          x: c.x || 100, y: c.y || 100
        };
      });
      data.nodes.forEach(n => {
        if (!n.name || !DC.FLOW_KEYWORDS.includes(n.type)) return;
        const id = Number.isInteger(n.id) ? n.id : nextId();
        if (id > maxId) maxId = id;
        nodes[n.name] = {
          kind: 'node', id, type: n.type, name: n.name, text: n.text || '',
          x: n.x || 100, y: n.y || 100
        };
      });

      const all = new Set([...Object.keys(classes), ...Object.keys(nodes)]);
      const edges = data.edges.filter(ed => all.has(ed.from) && all.has(ed.to)).map(ed => ({
        from: ed.from, fromSide: ed.fromSide || null,
        to: ed.to, toSide: ed.toSide || null,
        type: ed.type || 'flow', route: ed.route || null,
        pts: Array.isArray(ed.pts) ? ed.pts : null,
        ptsCustom: Array.isArray(ed.pts),
        label: ed.label || ''
      }));

      state.classes = classes;
      state.nodes = nodes;
      state.edges = edges;
      state.lastId = Math.max(data.lastId || 0, maxId);
      state.selected = null;
      DC.updateCodeFromState();
      DC.render();
    };
    reader.readAsText(file);
  }

  DC.exportJSON = exportJSON;
  DC.importJSON = importJSON;
})();
