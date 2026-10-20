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
    if (n.style && Object.keys(n.style).length) out.style = n.style;
    return out;
  }

  function exportJSON() {
    const theme = DC.getTheme();
    const hasTheme = JSON.stringify(theme) !== JSON.stringify(DC.defaultTheme());
    const data = {
      format: 'DiagramCode',
      version: 3,
      lastId: state.lastId,
      theme: hasTheme ? theme : undefined,
      classes: Object.values(state.classes).map(stripNode),
      nodes: Object.values(state.nodes).map(stripNode),
      edges: state.edges.map(ed => {
        const e = {
          from: ed.from, fromSide: ed.fromSide || null,
          to: ed.to, toSide: ed.toSide || null,
          type: ed.type, route: ed.route || null,
          pts: ed.ptsCustom && ed.pts ? ed.pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) : null,
          label: ed.label || ''
        };
        if (ed.style && Object.keys(ed.style).length) e.style = ed.style;
        return e;
      })
    };
    if (data.theme === undefined) delete data.theme;

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
          x: c.x || 100, y: c.y || 100,
          style: (c.style && typeof c.style === 'object') ? c.style : null
        };
      });
      data.nodes.forEach(n => {
        if (!n.name || !DC.FLOW_KEYWORDS.includes(n.type)) return;
        const id = Number.isInteger(n.id) ? n.id : nextId();
        if (id > maxId) maxId = id;
        nodes[n.name] = {
          kind: 'node', id, type: n.type, name: n.name, text: n.text || '',
          x: n.x || 100, y: n.y || 100,
          style: (n.style && typeof n.style === 'object') ? n.style : null
        };
      });

      const all = new Set([...Object.keys(classes), ...Object.keys(nodes)]);
      const edges = data.edges.filter(ed => all.has(ed.from) && all.has(ed.to)).map(ed => ({
        from: ed.from, fromSide: ed.fromSide || null,
        to: ed.to, toSide: ed.toSide || null,
        type: ed.type || 'flow', route: ed.route || null,
        pts: Array.isArray(ed.pts) ? ed.pts : null,
        ptsCustom: Array.isArray(ed.pts),
        label: ed.label || '',
        style: (ed.style && typeof ed.style === 'object') ? ed.style : null
      }));

      state.classes = classes;
      state.nodes = nodes;
      state.edges = edges;
      state.theme = (data.theme && typeof data.theme === 'object')
        ? Object.assign(DC.defaultTheme(), data.theme)
        : DC.defaultTheme();
      state.lastId = Math.max(data.lastId || 0, maxId);
      state.selected = null;
      DC.updateCodeFromState();
      DC.render();
    };
    reader.readAsText(file);
  }

  DC.exportJSON = exportJSON;
  DC.importJSON = importJSON;

  function contentBBox() {
    const state = DC.state;
    const all = { ...state.classes, ...state.nodes };
    const units = Object.values(all);
    if (!units.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    units.forEach(u => {
      const b = u._box || (u.kind === 'class' ? DC.classBox(u) : DC.flowNodeBox(u));
      x1 = Math.min(x1, u.x); y1 = Math.min(y1, u.y);
      x2 = Math.max(x2, u.x + b.width); y2 = Math.max(y2, u.y + b.height + 10);
    });
    return { x1, y1, x2, y2 };
  }

  const INLINE_PROPS = [
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap',
    'font-size', 'font-family', 'font-weight', 'font-style', 'opacity'
  ];
  const SKIP_SEL = '.port, .edge-hit, .edge-wp, .edge-ep, #temp-edge, .node-id';

  function inlineStyles(srcNode, dstNode, canvasBg) {
    if (srcNode.nodeType === 1) {
      const cs = getComputedStyle(srcNode);
      const parts = [];
      INLINE_PROPS.forEach(p => {
        let v = cs.getPropertyValue(p);
        if (v && v.includes('var(')) v = canvasBg;
        if (v === 'rgba(0, 0, 0, 0)' || v === 'transparent') {
          if (p === 'fill' || p === 'stroke') v = 'none';
        }
        if (v && v !== 'normal') parts.push(`${p}:${v}`);
      });
      if (srcNode.tagName === 'svg' || srcNode.tagName === 'g') {
        const keep = parts.filter(p => !/^(fill|stroke|stroke-width):/.test(p));
        if (keep.length) dstNode.setAttribute('style', keep.join(';'));
        else dstNode.removeAttribute('style');
      } else {
        dstNode.setAttribute('style', parts.join(';'));
      }
    }
    const srcKids = [...srcNode.childNodes];
    const dstKids = [...dstNode.childNodes];
    for (let i = 0; i < srcKids.length; i++) {
      const s = srcKids[i], d = dstKids[i];
      if (!d) continue;
      if (s.nodeType === 1 && s.matches && s.matches(SKIP_SEL)) {
        d.parentNode.removeChild(d);
        continue;
      }
      inlineStyles(s, d, canvasBg);
    }
  }

  function buildStandaloneSVG() {
    const bbox = contentBBox();
    if (!bbox) return null;
    const PAD = 40;
    const vb = [bbox.x1 - PAD, bbox.y1 - PAD,
      (bbox.x2 - bbox.x1) + PAD * 2, (bbox.y2 - bbox.y1) + PAD * 2];
    const w = Math.round(vb[2]), h = Math.round(vb[3]);

    const canvasBg = getComputedStyle(document.body).getPropertyValue('--canvas-bg').trim()
      || (document.body.classList.contains('light') ? '#dce0e8' : '#11111b');

    const clone = DC.canvas.cloneNode(true);
    inlineStyles(DC.canvas, clone, canvasBg);

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    clone.setAttribute('viewBox', vb.join(' '));

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', vb[0]); bg.setAttribute('y', vb[1]);
    bg.setAttribute('width', vb[2]); bg.setAttribute('height', vb[3]);
    bg.setAttribute('fill', canvasBg);
    clone.insertBefore(bg, clone.firstChild);

    return { svg: new XMLSerializer().serializeToString(clone), w, h };
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportImage(kind) {
    const built = buildStandaloneSVG();
    if (!built) { alert('Схема пуста'); return; }
    const base = suggestedName();
    if (kind === 'svg') {
      download(new Blob([built.svg], { type: 'image/svg+xml' }), base + '.svg');
      return;
    }
    const scale = 3;
    const img = new Image();
    const blobUrl = URL.createObjectURL(new Blob([built.svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = built.w * scale;
      canvas.height = built.h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(blobUrl);
      canvas.toBlob(b => {
        if (!b) { alert('Не удалось создать PNG'); return; }
        download(b, base + '@3x.png');
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); alert('Не удалось отрисовать PNG'); };
    img.src = blobUrl;
  }

  DC.exportImage = exportImage;
})();
