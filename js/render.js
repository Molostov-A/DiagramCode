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
      if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  const measureText = (t, s = 12) => t.length * s * 0.62;

  function getNode(name) { return state.classes[name] || state.nodes[name]; }

  function classBox(cls) {
    const lineH = 16, titleH = 22;
    const allMembers = [...cls.attributes, ...cls.methods];
    const width = Math.max(120,
      measureText(cls.name, 13) + 30,
      ...allMembers.map(m => measureText(m) + 20),
      cls.stereotype ? measureText(`«${cls.stereotype}»`, 11) + 30 : 0
    );
    const stereotypeH = cls.stereotype ? 14 : 0;
    const attrH = cls.attributes.length ? cls.attributes.length * lineH + 6 : 0;
    const methH = cls.methods.length ? cls.methods.length * lineH + 6 : 0;
    return { width, height: titleH + stereotypeH + attrH + methH + 4 };
  }

  function flowNodeBox(node) {
    const labelW = measureText(node.name, 12);
    const textW = node.text ? measureText(node.text, 12) : 0;
    const contentW = Math.max(labelW, textW);
    switch (node.type) {
      case 'decision': return { width: Math.max(140, contentW + 60), height: Math.max(80, node.text ? 60 : 50) };
      case 'start': case 'end': case 'connector':
        return { width: Math.max(120, contentW + 50), height: 44 };
      case 'io': case 'data': return { width: Math.max(140, contentW + 50), height: 50 };
      case 'prep': case 'manual': return { width: Math.max(140, contentW + 50), height: 52 };
      case 'doc': return { width: Math.max(140, contentW + 40), height: 55 };
      case 'note': return { width: Math.max(120, contentW + 30), height: 40 };
      default: return { width: Math.max(130, contentW + 30), height: 50 };
    }
  }

  function drawClass(cls) {
    const { width, height } = classBox(cls);
    cls._box = { width, height };

    const g = el('g', {
      class: 'uml-class node-group', 'data-name': cls.name, 'data-kind': 'class',
      transform: `translate(${cls.x},${cls.y})`
    }, canvas);
    if (state.selected?.kind === 'class' && state.selected.id === cls.name) g.classList.add('selected');

    el('rect', { x: 0, y: 0, width, height, rx: 4 }, g);

    let y = 16;
    if (cls.stereotype) {
      el('text', { x: width/2, y, 'text-anchor': 'middle', class: 'stereotype', text: `«${cls.stereotype}»` }, g);
      y += 14;
    }
    el('text', { x: width/2, y, 'text-anchor': 'middle', class: 'title', text: cls.name }, g);
    y += 6;

    if (cls.attributes.length) {
      el('line', { x1: 0, y1: y, x2: width, y2: y, class: 'divider' }, g);
      y += 14;
      cls.attributes.forEach(a => { el('text', { x: 8, y, text: a }, g); y += 16; });
      y -= 4;
    }
    if (cls.methods.length) {
      el('line', { x1: 0, y1: y, x2: width, y2: y, class: 'divider' }, g);
      y += 14;
      cls.methods.forEach(m => { el('text', { x: 8, y, text: m }, g); y += 16; });
    }

    addPorts(g, cls, width, height);
  }

  function drawFlowNode(node) {
    const { width: w, height: h } = flowNodeBox(node);
    node._box = { width: w, height: h };

    const g = el('g', {
      class: `flow-node ${node.type} node-group node-body`,
      'data-name': node.name, 'data-kind': 'node',
      transform: `translate(${node.x},${node.y})`
    }, canvas);
    if (state.selected?.kind === 'node' && state.selected.id === node.name) g.classList.add('selected');

    const shape = el('g', { class: 'shape' }, g);

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
        el('line', { x1: 6, y1: 0, x2: 6, y2: h, stroke: '#a6e3a1', 'stroke-width': 1.5 }, shape);
        el('line', { x1: w-6, y1: 0, x2: w-6, y2: h, stroke: '#a6e3a1', 'stroke-width': 1.5 }, shape);
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
        el('text', { x: w/2, y: h/2 - 4, 'text-anchor': 'middle', class: 'node-label', text: node.name }, g);
        el('text', { x: w/2, y: h/2 + 14, 'text-anchor': 'middle', text: node.text }, g);
      } else {
        el('text', { x: w/2, y: h/2 + 4, 'text-anchor': 'middle', class: 'node-label', text: node.name }, g);
      }
    } else if (node.type === 'connector') {
      el('text', { x: w/2, y: h/2 + 4, 'text-anchor': 'middle', class: 'node-label', text: node.name }, g);
    } else if (node.type === 'note') {
      el('text', { x: 18, y: h/2 + 4, class: 'node-label', text: node.name }, g);
      if (node.text) el('text', { x: 18 + measureText(node.name) + 8, y: h/2 + 4, text: ': ' + node.text }, g);
    } else {
      if (node.text) {
        el('text', { x: w/2, y: h/2 - 4, 'text-anchor': 'middle', class: 'node-label', text: node.name }, g);
        el('text', { x: w/2, y: h/2 + 14, 'text-anchor': 'middle', text: node.text }, g);
      } else {
        el('text', { x: w/2, y: h/2 + 4, 'text-anchor': 'middle', class: 'node-label', text: node.name }, g);
      }
    }

    addPorts(g, node, w, h);
  }

  function addPorts(g, node, w, h) {
    const ports = [
      { side: 'right',  cx: w,     cy: h/2,  x: w,   y: h/2 },
      { side: 'left',   cx: 0,     cy: h/2,  x: 0,   y: h/2 },
      { side: 'top',    cx: w/2,   cy: 0,    x: w/2, y: 0 },
      { side: 'bottom', cx: w/2,   cy: h,    x: w/2, y: h }
    ];
    ports.forEach(p => {
      el('circle', {
        cx: p.cx, cy: p.cy, r: 5, class: 'port',
        'data-port-node': node.name, 'data-port-side': p.side
      }, g);
    });
  }

  function drawEdge(edge, a, b, idx) {
    const aBox = a._box || (a.kind === 'class' ? classBox(a) : flowNodeBox(a));
    const bBox = b._box || (b.kind === 'class' ? classBox(b) : flowNodeBox(b));
    a._box = aBox; b._box = bBox;

    const ac = { x: a.x + aBox.width/2, y: a.y + aBox.height/2 };
    const bc = { x: b.x + bBox.width/2, y: b.y + bBox.height/2 };
    const p1 = intersectBoundary(ac, bc, a, aBox);
    const p2 = intersectBoundary(bc, ac, b, bBox);

    const isFlow = edge.type === 'flow' || edge.type === 'flowDashed';
    const cls = 'edge' + ((edge.type === 'flowDashed' || edge.type === 'dependency') ? ' dashed' : '');

    const g = el('g', { class: cls, 'data-idx': idx }, canvas);
    if (state.selected?.kind === 'edge' && state.selected.id === idx) g.classList.add('selected');

    el('path', { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, class: 'edge-hit' }, g);
    el('path', { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}` }, g);

    if (isFlow) drawArrowOpen(g, p1, p2);
    else if (edge.type === 'inherit') drawArrowTriangle(g, p1, p2, true);
    else if (edge.type === 'composition') drawArrowDiamond(g, p1, p2, true);
    else if (edge.type === 'aggregation') drawArrowDiamond(g, p1, p2, false);
    else drawArrowOpen(g, p1, p2);

    if (edge.label) {
      el('text', { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 - 6, 'text-anchor': 'middle', text: edge.label }, g);
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

  function drawArrowOpen(g, p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const size = 10;
    const a1 = Math.atan2(-dy, -dx) + Math.PI/6;
    const a2 = Math.atan2(-dy, -dx) - Math.PI/6;
    el('polygon', {
      points: `${p2.x},${p2.y} ${p2.x + Math.cos(a1)*size},${p2.y + Math.sin(a1)*size} ${p2.x + Math.cos(a2)*size},${p2.y + Math.sin(a2)*size}`,
      class: 'arrow'
    }, g);
  }

  function drawArrowTriangle(g, p1, p2, hollow) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;
    const size = 11;
    const bx = p2.x - ux*size, by = p2.y - uy*size;
    const px = -uy*size*0.6, py = ux*size*0.6;
    el('polygon', {
      points: `${p2.x},${p2.y} ${bx+px},${by+py} ${bx-px},${by-py}`,
      class: 'arrow', fill: hollow ? '#1e1e2e' : '#a6adc8',
      stroke: '#a6adc8', 'stroke-width': 1.4
    }, g);
  }

  function drawArrowDiamond(g, p1, p2, filled) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;
    const size = 12;
    const bx = p2.x - ux*size, by = p2.y - uy*size;
    const px = -uy*size*0.55, py = ux*size*0.55;
    const tx = p2.x - ux*size*2, ty = p2.y - uy*size*2;
    el('polygon', {
      points: `${p2.x},${p2.y} ${bx+px},${by+py} ${tx},${ty} ${bx-px},${by-py}`,
      class: 'arrow', fill: filled ? '#a6adc8' : '#1e1e2e',
      stroke: '#a6adc8', 'stroke-width': 1.4
    }, g);
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
      drawEdge(edge, a, b, idx);
    });

    Object.values(state.classes).forEach(drawClass);
    Object.values(state.nodes).forEach(drawFlowNode);

    DC.renderProperties();
  }

  Object.assign(DC, {
    SVG_NS, canvas, canvasWrap, el, measureText, getNode,
    classBox, flowNodeBox, drawClass, drawFlowNode, addPorts,
    drawEdge, intersectBoundary, render
  });
})();
