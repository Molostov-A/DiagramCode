'use strict';
window.DC = window.DC || {};

(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const canvas = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');
  const state = DC.state;

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  const measureText = (t, s = 12) => t.length * s * 0.62;

  const FONT_STACKS = {
    mono: "'JetBrains Mono','Consolas',monospace",
    sans: "-apple-system,'Segoe UI',sans-serif",
    serif: "Georgia,'Times New Roman',serif"
  };

  const PALETTE = [
    '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb',
    '#89b4fa', '#cba6f7', '#f5c2e7', '#eba0ac', '#b4befe', '#a6adc8'
  ];

  function paletteColor(id) {
    return PALETTE[((id || 1) - 1) % PALETTE.length];
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }

  const lineH = fs => fs + 4;

  function nodeStyle(u) {
    const t = DC.getTheme();
    const ov = u.style || {};
    const pick = (key) => ov[key] !== undefined ? ov[key] : t[key];
    const fill = ov.fill !== undefined ? ov.fill : t.fill;
    const stroke = ov.stroke !== undefined ? ov.stroke
      : (t.paletteMode ? paletteColor(u.id) : t.stroke);
    return {
      fill: fill || undefined,
      stroke: stroke || undefined,
      strokeWidth: num(pick('strokeWidth')),
      textColor: pick('textColor') || undefined,
      fontSize: num(pick('fontSize')),
      fontFamily: pick('fontFamily') || undefined,
      bold: pick('bold') === true
    };
  }

  function edgeStyle(edge) {
    const t = DC.getTheme();
    const ov = edge.style || {};
    const pick = (key, themeKey) => ov[key] !== undefined ? ov[key] : t[themeKey || key];
    const typeDashed = edge.type === 'flowDashed' || edge.type === 'dependency';
    const baseDashed = t.edgeDashed === 'solid' ? false
      : t.edgeDashed === 'dashed' ? true : typeDashed;
    const dashed = ov.dashed === 'solid' ? false
      : ov.dashed === 'dashed' ? true : baseDashed;
    return {
      color: pick('color', 'edgeColor') || undefined,
      strokeWidth: num(pick('strokeWidth', 'edgeWidth')),
      dashed,
      textColor: pick('textColor') || undefined,
      fontSize: num(pick('fontSize')),
      fontFamily: pick('fontFamily') || undefined,
      bold: pick('bold') === true
    };
  }

  function boxStyleAttr(st) {
    const m = [];
    if (st.fill) m.push(`fill:${st.fill}`);
    if (st.stroke) m.push(`stroke:${st.stroke}`);
    if (st.strokeWidth !== undefined) m.push(`stroke-width:${st.strokeWidth}`);
    return m.join(';');
  }

  function textStyleAttr(st) {
    const m = [];
    if (st.textColor) m.push(`fill:${st.textColor}`);
    if (st.fontSize) m.push(`font-size:${st.fontSize}px`);
    if (st.fontFamily && FONT_STACKS[st.fontFamily]) m.push(`font-family:${FONT_STACKS[st.fontFamily]}`);
    if (st.bold) m.push('font-weight:bold');
    return m.join(';');
  }

  function getNode(name) { return state.classes[name] || state.nodes[name]; }

  function classBox(cls) {
    const st = nodeStyle(cls);
    const fs = st.fontSize || 12;
    const lineH = fs + 4, titleH = fs + 10;
    const allMembers = [...cls.attributes, ...cls.methods];
    const width = Math.max(120,
      measureText(cls.name, fs + 1) + 30,
      ...allMembers.map(m => measureText(m, fs) + 20),
      cls.stereotype ? measureText(`«${cls.stereotype}»`, fs - 1) + 30 : 0
    );
    const stereotypeH = cls.stereotype ? fs + 2 : 0;
    const attrH = cls.attributes.length ? cls.attributes.length * lineH + 6 : 0;
    const methH = cls.methods.length ? cls.methods.length * lineH + 6 : 0;
    return { width, height: titleH + stereotypeH + attrH + methH + 4 };
  }

  function flowNodeBox(node) {
    const st = nodeStyle(node);
    const fs = st.fontSize || 12;
    const labelW = measureText(node.name, fs);
    const textW = node.text ? measureText(node.text, fs) : 0;
    const contentW = Math.max(labelW, textW);
    const need = node.text ? fs * 2.6 + 16 : fs * 1.7 + 16;
    switch (node.type) {
      case 'decision': return { width: Math.max(140, contentW + 60), height: Math.max(80, need + 18) };
      case 'start': case 'end': case 'connector':
        return { width: Math.max(120, contentW + 50), height: Math.max(44, need) };
      case 'io': case 'data': return { width: Math.max(140, contentW + 50), height: Math.max(50, need) };
      case 'prep': case 'manual': return { width: Math.max(140, contentW + 50), height: Math.max(52, need) };
      case 'doc': return { width: Math.max(140, contentW + 40), height: Math.max(55, need) };
      case 'note': return { width: Math.max(120, contentW + 30), height: Math.max(40, need) };
      default: return { width: Math.max(130, contentW + 30), height: Math.max(50, need) };
    }
  }

  function drawClass(cls) {
    const { width, height } = classBox(cls);
    cls._box = { width, height };
    const st = nodeStyle(cls);
    const fs = st.fontSize || 12;
    const boxS = boxStyleAttr(st);
    const textS = textStyleAttr(st);

    const g = el('g', {
      class: 'uml-class node-group', 'data-name': cls.name, 'data-kind': 'class',
      transform: `translate(${cls.x},${cls.y})`
    }, canvas);
    if (state.selected?.kind === 'class' && state.selected.id === cls.name) g.classList.add('selected');

    el('rect', { x: 0, y: 0, width, height, rx: 4, style: boxS }, g);

    let y = fs + 4;
    if (cls.stereotype) {
      el('text', { x: width/2, y, 'text-anchor': 'middle', class: 'stereotype', style: textS, text: `«${cls.stereotype}»` }, g);
      y += fs + 2;
    }
    el('text', { x: width/2, y, 'text-anchor': 'middle', class: 'title', style: textS, text: cls.name }, g);
    y += 6;

    if (cls.attributes.length) {
      el('line', { x1: 0, y1: y, x2: width, y2: y, class: 'divider' }, g);
      y += fs + 2;
      cls.attributes.forEach(a => { el('text', { x: 8, y, style: textS, text: a }, g); y += lineH(fs); });
      y -= 4;
    }
    if (cls.methods.length) {
      el('line', { x1: 0, y1: y, x2: width, y2: y, class: 'divider' }, g);
      y += fs + 2;
      cls.methods.forEach(m => { el('text', { x: 8, y, style: textS, text: m }, g); y += lineH(fs); });
    }

    addPorts(g, cls, width, height);
    el('text', { x: 0, y: -6, class: 'node-id', text: `#${cls.id}` }, g);
  }

  function drawFlowNode(node) {
    const { width: w, height: h } = flowNodeBox(node);
    node._box = { width: w, height: h };
    const st = nodeStyle(node);
    const fs = st.fontSize || 12;
    const boxS = boxStyleAttr(st);
    const textS = textStyleAttr(st);
    const yName = Math.round(fs * 0.33);
    const yText = Math.round(fs * 1.17);

    const g = el('g', {
      class: `flow-node ${node.type} node-group node-body`,
      'data-name': node.name, 'data-kind': 'node',
      transform: `translate(${node.x},${node.y})`
    }, canvas);
    if (state.selected?.kind === 'node' && state.selected.id === node.name) g.classList.add('selected');

    const shape = el('g', { class: 'shape', style: boxS }, g);

    switch (node.type) {
      case 'start': case 'end':
        el('rect', { x: 0, y: 0, width: w, height: h, rx: h/2, ry: h/2 }, shape); break;
      case 'decision':
        el('polygon', { points: `${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}` }, shape); break;
      case 'io': case 'data': {
        const s = 18;
        el('polygon', { points: `${s},0 ${w},0 ${w-s},${h} 0,${h}` }, shape); break;
      }
      case 'prep': {
        const c = 16;
        el('polygon', { points: `${c},0 ${w-c},0 ${w},${h/2} ${w-c},${h} ${c},${h} 0,${h/2}` }, shape); break;
      }
      case 'manual': {
        const c = 16;
        el('polygon', { points: `${c},0 ${w},0 ${w-c},${h} 0,${h}` }, shape); break;
      }
      case 'doc': {
        const wy = h - 10;
        el('path', { d: `M 0 0 L ${w} 0 L ${w} ${wy} Q ${w*0.75} ${wy+10}, ${w*0.5} ${wy} Q ${w*0.25} ${wy-10}, 0 ${wy} Z` }, shape);
        break;
      }
      case 'predef':
        el('rect', { x: 0, y: 0, width: w, height: h }, shape);
        el('line', { x1: 6, y1: 0, x2: 6, y2: h, style: `stroke:${st.stroke || '#a6e3a1'}${st.strokeWidth !== undefined ? `;stroke-width:${st.strokeWidth}` : ''}` }, shape);
        el('line', { x1: w-6, y1: 0, x2: w-6, y2: h, style: `stroke:${st.stroke || '#a6e3a1'}${st.strokeWidth !== undefined ? `;stroke-width:${st.strokeWidth}` : ''}` }, shape);
        break;
      case 'connector':
        el('circle', { cx: w/2, cy: h/2, r: Math.min(w, h)/2 }, shape); break;
      case 'note':
        el('path', { d: `M 12 0 L 0 0 L 0 ${h} L 12 ${h}` }, shape); break;
      default:
        el('rect', { x: 0, y: 0, width: w, height: h, rx: 2 }, shape);
    }

    if (node.type === 'decision') {
      if (node.text) {
        el('text', { x: w/2, y: h/2 - yName, 'text-anchor': 'middle', class: 'node-label', style: textS, text: node.name }, g);
        el('text', { x: w/2, y: h/2 + yText, 'text-anchor': 'middle', style: textS, text: node.text }, g);
      } else {
        el('text', { x: w/2, y: h/2 + yName, 'text-anchor': 'middle', class: 'node-label', style: textS, text: node.name }, g);
      }
    } else if (node.type === 'connector') {
      el('text', { x: w/2, y: h/2 + yName, 'text-anchor': 'middle', class: 'node-label', style: textS, text: node.name }, g);
    } else if (node.type === 'note') {
      el('text', { x: 18, y: h/2 + yName, class: 'node-label', style: textS, text: node.name }, g);
      if (node.text) el('text', { x: 18 + measureText(node.name, fs) + 8, y: h/2 + yName, style: textS, text: ': ' + node.text }, g);
    } else {
      if (node.text) {
        el('text', { x: w/2, y: h/2 - yName, 'text-anchor': 'middle', class: 'node-label', style: textS, text: node.name }, g);
        el('text', { x: w/2, y: h/2 + yText, 'text-anchor': 'middle', style: textS, text: node.text }, g);
      } else {
        el('text', { x: w/2, y: h/2 + yName, 'text-anchor': 'middle', class: 'node-label', style: textS, text: node.name }, g);
      }
    }

    addPorts(g, node, w, h);
    el('text', { x: 0, y: -6, class: 'node-id', text: `#${node.id}` }, g);
  }

  function addPorts(g, node, w, h) {
    const isCircle = node.type === 'connector';
    const r = Math.min(w, h) / 2;
    const ports = isCircle ? [
      { side: 'right',  cx: w/2 + r, cy: h/2 },
      { side: 'left',   cx: w/2 - r, cy: h/2 },
      { side: 'top',    cx: w/2,     cy: h/2 - r },
      { side: 'bottom', cx: w/2,     cy: h/2 + r }
    ] : [
      { side: 'right',  cx: w,   cy: h/2 },
      { side: 'left',   cx: 0,   cy: h/2 },
      { side: 'top',    cx: w/2, cy: 0 },
      { side: 'bottom', cx: w/2, cy: h }
    ];
    ports.forEach(p => {
      el('circle', {
        cx: p.cx, cy: p.cy, r: 5, class: 'port',
        'data-port-node': node.name, 'data-port-side': p.side
      }, g);
    });
  }

  function sidePoint(node, box, side) {
    const { width: w, height: h } = box;
    if (node.type === 'connector') {
      const r = Math.min(w, h) / 2;
      const cx = node.x + w/2, cy = node.y + h/2;
      switch (side) {
        case 'top':    return { x: cx, y: cy - r };
        case 'bottom': return { x: cx, y: cy + r };
        case 'left':   return { x: cx - r, y: cy };
        case 'right':  return { x: cx + r, y: cy };
        default:       return null;
      }
    }
    switch (side) {
      case 'top':    return { x: node.x + w/2, y: node.y };
      case 'bottom': return { x: node.x + w/2, y: node.y + h };
      case 'left':   return { x: node.x, y: node.y + h/2 };
      case 'right':  return { x: node.x + w, y: node.y + h/2 };
      default:       return null;
    }
  }

  function nearestSide(node, box, pt) {
    const { width: w, height: h } = box;
    const dists = {
      left: Math.abs(pt.x - node.x),
      right: Math.abs(pt.x - (node.x + w)),
      top: Math.abs(pt.y - node.y),
      bottom: Math.abs(pt.y - (node.y + h))
    };
    return Object.keys(dists).reduce((a, b) => dists[a] <= dists[b] ? a : b);
  }

  function sideNormal(side) {
    switch (side) {
      case 'top':    return { x: 0, y: -1 };
      case 'bottom': return { x: 0, y: 1 };
      case 'left':   return { x: -1, y: 0 };
      case 'right':  return { x: 1, y: 0 };
      default:       return null;
    }
  }

  function normalFor(edge, node, box, p, isFrom) {
    const side = isFrom ? edge.fromSide : edge.toSide;
    const n = sideNormal(side);
    if (n) return n;
    const dx = p.x - (node.x + box.width/2);
    const dy = p.y - (node.y + box.height/2);
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx/len, y: dy/len };
  }

  function defaultEdgePts(edge, a, b, aBox, bBox, p1, p2, n1, n2) {
    const route = edge.route || 'auto';
    const OFF = 22;
    if (route === 'smooth') {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const k = Math.min(200, Math.max(40, dist * 0.4));
      return [
        { x: p1.x + n1.x * k, y: p1.y + n1.y * k },
        { x: p2.x + n2.x * k, y: p2.y + n2.y * k }
      ];
    }
    const a1 = { x: p1.x + n1.x * OFF, y: p1.y + n1.y * OFF };
    const a2 = { x: p2.x + n2.x * OFF, y: p2.y + n2.y * OFF };
    if (route === 'polyline') return [a1, a2];
    // rect: ортогональный канал
    const h1 = Math.abs(n1.x) > 0.5;
    const h2 = Math.abs(n2.x) > 0.5;
    const mid = [];
    if (h1 === h2) {
      if (h1) {
        const mx = (a1.x + a2.x) / 2;
        mid.push({ x: mx, y: a1.y }, { x: mx, y: a2.y });
      } else {
        const my = (a1.y + a2.y) / 2;
        mid.push({ x: a1.x, y: my }, { x: a2.x, y: my });
      }
    } else {
      mid.push(h1 ? { x: a2.x, y: a1.y } : { x: a1.x, y: a2.y });
    }
    return [a1, ...mid, a2];
  }

  function buildEdgePath(edge, a, b, aBox, bBox, p1, p2) {
    const route = edge.route || 'auto';
    if (route === 'auto') {
      return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, prev: p1, pts: [] };
    }

    const n1 = normalFor(edge, a, aBox, p1, true);
    const n2 = normalFor(edge, b, bBox, p2, false);
    const pts = (edge.ptsCustom && edge.pts) ? edge.pts : defaultEdgePts(edge, a, b, aBox, bBox, p1, p2, n1, n2);

    if (route === 'smooth' && pts.length >= 2) {
      const [c1, c2] = pts;
      return {
        d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
        prev: { x: p2.x + (p2.x - c2.x), y: p2.y + (p2.y - c2.y) },
        pts
      };
    }

    if (route === 'polyline') {
      const all = [p1, ...pts, p2];
      return {
        d: 'M ' + all.map(p => `${p.x} ${p.y}`).join(' L '),
        prev: pts.length ? pts[pts.length - 1] : p1,
        pts
      };
    }

    // rect: ортогональные сегменты, углы вставляются между вершинами
    const all = [p1, ...pts, p2];
    const ortho = [all[0]];
    for (let i = 0; i < all.length - 1; i++) {
      const u = all[i], v = all[i + 1];
      if (Math.abs(u.x - v.x) > 0.5 && Math.abs(u.y - v.y) > 0.5) {
        ortho.push({ x: v.x, y: u.y });
      }
      ortho.push(v);
    }
    return {
      d: 'M ' + ortho.map(p => `${p.x} ${p.y}`).join(' L '),
      prev: pts.length ? pts[pts.length - 1] : p1,
      pts
    };
  }

  function drawEdge(edge, a, b, idx) {
    const aBox = a._box || (a.kind === 'class' ? classBox(a) : flowNodeBox(a));
    const bBox = b._box || (b.kind === 'class' ? classBox(b) : flowNodeBox(b));
    a._box = aBox; b._box = bBox;

    const ac = { x: a.x + aBox.width/2, y: a.y + aBox.height/2 };
    const bc = { x: b.x + bBox.width/2, y: b.y + bBox.height/2 };
    const p1 = edge.fromSide ? sidePoint(a, aBox, edge.fromSide) : intersectBoundary(ac, bc, a, aBox);
    const p2 = edge.toSide ? sidePoint(b, bBox, edge.toSide) : intersectBoundary(bc, ac, b, bBox);

    const { d, prev, pts } = buildEdgePath(edge, a, b, aBox, bBox, p1, p2);
    const isFlow = edge.type === 'flow' || edge.type === 'flowDashed';
    const st = edgeStyle(edge);
    const cls = 'edge' + (st.dashed ? ' dashed' : '');

    const g = el('g', { class: cls, 'data-idx': idx }, canvas);
    const isSelected = state.selected?.kind === 'edge' && state.selected.id === idx;
    if (isSelected) g.classList.add('selected');

    const pathS = [];
    if (st.color) pathS.push(`stroke:${st.color}`);
    if (st.strokeWidth !== undefined) pathS.push(`stroke-width:${st.strokeWidth}`);
    const labelS = textStyleAttr(st);
    const arrowColor = st.color || null;

    el('path', { d, class: 'edge-hit' }, g);
    el('path', { d, style: pathS.join(';') || undefined }, g);

    if (isFlow) drawArrowOpen(g, prev, p2, arrowColor);
    else if (edge.type === 'inherit') drawArrowTriangle(g, prev, p2, true, arrowColor);
    else if (edge.type === 'composition') drawArrowDiamond(g, prev, p2, true, arrowColor);
    else if (edge.type === 'aggregation') drawArrowDiamond(g, prev, p2, false, arrowColor);
    else drawArrowOpen(g, prev, p2, arrowColor);

    if (edge.label) {
      el('text', { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 - 6, 'text-anchor': 'middle', style: labelS || undefined, text: edge.label }, g);
    }

    if (isSelected && edge.route) {
      pts.forEach((pt, pi) => {
        el('circle', {
          cx: pt.x, cy: pt.y, r: 6,
          class: 'edge-wp', 'data-edge-idx': idx, 'data-wp-idx': pi
        }, g);
      });
    }

    if (isSelected) {
      el('circle', {
        cx: p1.x, cy: p1.y, r: 7,
        class: 'edge-ep', 'data-edge-idx': idx, 'data-end': 'from'
      }, g);
      el('circle', {
        cx: p2.x, cy: p2.y, r: 7,
        class: 'edge-ep', 'data-edge-idx': idx, 'data-end': 'to'
      }, g);
    }
  }

  function intersectBoundary(fromCenter, toCenter, node, dims) {
    const cx = node.x + dims.width/2, cy = node.y + dims.height/2;
    const dx = toCenter.x - cx, dy = toCenter.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    if (node.type === 'decision') {
      const hw = dims.width/2, hh = dims.height/2;
      const t = 1 / (Math.abs(dx)/hw + Math.abs(dy)/hh);
      return { x: cx + dx*t, y: cy + dy*t };
    }
    if (node.type === 'connector') {
      const r = Math.min(dims.width, dims.height)/2;
      const len = Math.hypot(dx, dy);
      return { x: cx + dx/len*r, y: cy + dy/len*r };
    }
    const hw = dims.width/2, hh = dims.height/2;
    const sx = dx !== 0 ? hw/Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? hh/Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: cx + dx*s, y: cy + dy*s };
  }

  function drawArrowOpen(g, p1, p2, color) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const size = 10;
    const a1 = Math.atan2(-dy, -dx) + Math.PI/6;
    const a2 = Math.atan2(-dy, -dx) - Math.PI/6;
    el('polygon', {
      points: `${p2.x},${p2.y} ${p2.x + Math.cos(a1)*size},${p2.y + Math.sin(a1)*size} ${p2.x + Math.cos(a2)*size},${p2.y + Math.sin(a2)*size}`,
      class: 'arrow', style: color ? `fill:${color}` : undefined
    }, g);
  }

  function canvasBackground() {
    return document.body.classList.contains('light') ? '#dce0e8' : '#11111b';
  }

  function drawArrowTriangle(g, p1, p2, hollow, color) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;
    const size = 11;
    const bx = p2.x - ux*size, by = p2.y - uy*size;
    const px = -uy*size*0.6, py = ux*size*0.6;
    const s = [];
    if (hollow) s.push(`fill:${canvasBackground()}`);
    else if (color) s.push(`fill:${color}`);
    if (color) { s.push(`stroke:${color}`); s.push('stroke-width:1.4'); }
    el('polygon', {
      points: `${p2.x},${p2.y} ${bx+px},${by+py} ${bx-px},${by-py}`,
      class: 'arrow', style: s.join(';') || undefined
    }, g);
  }

  function drawArrowDiamond(g, p1, p2, filled, color) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;
    const size = 12;
    const bx = p2.x - ux*size, by = p2.y - uy*size;
    const px = -uy*size*0.55, py = ux*size*0.55;
    const tx = p2.x - ux*size*2, ty = p2.y - uy*size*2;
    const s = [];
    if (filled) { if (color) s.push(`fill:${color}`); }
    else s.push(`fill:${canvasBackground()}`);
    if (color) { s.push(`stroke:${color}`); s.push('stroke-width:1.4'); }
    el('polygon', {
      points: `${p2.x},${p2.y} ${bx+px},${by+py} ${tx},${ty} ${bx-px},${by-py}`,
      class: 'arrow', style: s.join(';') || undefined
    }, g);
  }

  function syncStylePanel(hasSelection) {
    const panel = document.getElementById('style-panel');
    if (!panel) return;
    const collapsed = hasSelection || DC._styleUserCollapsed === true;
    panel.classList.toggle('collapsed', collapsed);
    panel.classList.toggle('locked', hasSelection);
    const btn = document.getElementById('toggle-style');
    if (btn) {
      btn.textContent = collapsed ? '▸' : '▾';
      btn.title = hasSelection ? 'Снимите выделение, чтобы изменить оформление' : 'Свернуть';
    }
  }

  let lastSelKey;
  function renderPropsIfNeeded() {
    const selKey = state.selected ? state.selected.kind + ':' + state.selected.id : '';
    syncStylePanel(!!state.selected);
    if (selKey === lastSelKey) return;
    lastSelKey = selKey;
    const active = document.activeElement;
    const aid = active && active.id;
    const pos = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    DC.renderProperties();
    if (aid) {
      const el2 = document.getElementById(aid);
      if (el2 && el2.focus) {
        el2.focus();
        if (pos !== null) { try { el2.setSelectionRange(pos, pos); } catch (e) {} }
      }
    }
  }

  function render() {
    canvas.innerHTML = '';
    const allNodes = { ...state.classes, ...state.nodes };

    state.edges.forEach((edge, idx) => {
      const a = allNodes[edge.from], b = allNodes[edge.to];
      if (!a || !b) return;
      if (a.kind === 'class') a._box = classBox(a);
      else a._box = flowNodeBox(a);
      if (b.kind === 'class') b._box = classBox(b);
      else b._box = flowNodeBox(b);
    });

    state.edges.forEach((edge, idx) => {
      const a = allNodes[edge.from], b = allNodes[edge.to];
      if (!a || !b) return;
      if (state.selected?.kind === 'edge' && state.selected.id === idx) return;
      drawEdge(edge, a, b, idx);
    });

    Object.values(state.classes).forEach(drawClass);
    Object.values(state.nodes).forEach(drawFlowNode);

    if (state.selected?.kind === 'edge') {
      const edge = state.edges[state.selected.id];
      if (edge) {
        const a = allNodes[edge.from], b = allNodes[edge.to];
        if (a && b) drawEdge(edge, a, b, state.selected.id);
      }
    }

    renderPropsIfNeeded();
    DC.renderSpec();
    if (DC.renderStyleEditor) {
      const se = document.getElementById('style-editor');
      const ae = document.activeElement;
      if (!se || !ae || !se.contains(ae)) DC.renderStyleEditor();
    }
  }

  Object.assign(DC, {
    SVG_NS, canvas, canvasWrap, el, measureText, getNode,
    classBox, flowNodeBox, drawClass, drawFlowNode, addPorts,
    drawEdge, intersectBoundary, sidePoint, nearestSide, render,
    nodeStyle, edgeStyle, paletteColor, boxStyleAttr, textStyleAttr,
    FONT_STACKS, PALETTE
  });
})();
