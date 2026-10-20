'use strict';
window.DC = window.DC || {};

(function () {
  const state = DC.state;
  let drag = null;
  let linkDrag = null;
  let wpDrag = null;
  let epDrag = null;
  let zoom = 1;

  function applyZoom() {
    DC.canvas.style.transform = `scale(${zoom})`;
  }

  function svgPoint(e) {
    const rect = DC.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  function generateName(type) {
    const baseMap = {
      start: 'Start', end: 'End', process: 'Process', decision: 'Decision',
      io: 'IO', data: 'Data', predef: 'Predef', doc: 'Doc', prep: 'Prep',
      manual: 'Manual', note: 'Note', connector: 'Conn', 'class': 'Class'
    };
    const base = baseMap[type] || 'Node';
    let n = 1, name = base;
    const all = { ...state.classes, ...state.nodes };
    while (all[name]) name = base + (++n);
    return name;
  }

  function cyclePortSide(nodeName, portSide) {
    const state = DC.state;
    let changed = false;
    state.edges.forEach(ed => {
      if (ed.from === nodeName) {
        if (ed.fromSide === portSide) ed.fromSide = null;
        else ed.fromSide = portSide;
        changed = true;
      } else if (ed.to === nodeName) {
        if (ed.toSide === portSide) ed.toSide = null;
        else ed.toSide = portSide;
        changed = true;
      }
    });
    if (changed) {
      DC.updateCodeFromState();
      DC.render();
    }
    return changed;
  }

  function setupInteractions() {
    const canvas = DC.canvas;
    const canvasWrap = DC.canvasWrap;
    let pan = null;

    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;

      const epEl = e.target.closest('.edge-ep');
      if (epEl) {
        e.preventDefault();
        e.stopPropagation();
        const edgeIdx = parseInt(epEl.dataset.edgeIdx);
        const ed = state.edges[edgeIdx];
        if (!ed) return;
        state.selected = { kind: 'edge', id: edgeIdx };
        epDrag = { edgeIdx, end: epEl.dataset.end, startX: e.clientX, startY: e.clientY, moved: false };
        const tempPath = DC.el('path', { id: 'temp-edge', d: '' }, canvas);
        epDrag.tempPath = tempPath;
        canvas.classList.add('dragging');
        return;
      }

      const wpEl = e.target.closest('.edge-wp');
      if (wpEl) {
        e.preventDefault();
        e.stopPropagation();
        const edgeIdx = parseInt(wpEl.dataset.edgeIdx);
        const wpIdx = parseInt(wpEl.dataset.wpIdx);
        const ed = state.edges[edgeIdx];
        if (!ed) return;
        if (!ed.ptsCustom) {
          const ptsEl = wpEl.closest('.edge').querySelectorAll('.edge-wp');
          ed.pts = Array.from(ptsEl).map(c => ({ x: parseFloat(c.getAttribute('cx')), y: parseFloat(c.getAttribute('cy')) }));
          ed.ptsCustom = true;
        }
        state.selected = { kind: 'edge', id: edgeIdx };
        wpDrag = { edgeIdx, wpIdx };
        canvas.classList.add('dragging');
        return;
      }

      const portEl = e.target.closest('.port');
      if (portEl) {
        e.preventDefault();
        e.stopPropagation();
        const fromName = portEl.dataset.portNode;
        linkDrag = {
          from: fromName, fromSide: portEl.dataset.portSide || null,
          startX: e.clientX, startY: e.clientY, moved: false
        };
        const tempPath = DC.el('path', { id: 'temp-edge', d: '' }, canvas);
        linkDrag.tempPath = tempPath;
        return;
      }

      const nodeEl = e.target.closest('[data-kind="class"], [data-kind="node"]');
      const edgeEl = e.target.closest('.edge');

      if (nodeEl) {
        const kind = nodeEl.dataset.kind;
        const name = nodeEl.dataset.name;
        state.selected = { kind, id: name };
        const pt = svgPoint(e);
        const obj = kind === 'class' ? state.classes[name] : state.nodes[name];
        drag = { kind, name, offsetX: pt.x - obj.x, offsetY: pt.y - obj.y };
        canvas.classList.add('dragging');
        DC.render();
      } else if (edgeEl) {
        state.selected = { kind: 'edge', id: parseInt(edgeEl.dataset.idx) };
        DC.render();
      } else {
        state.selected = null;
        DC.render();
      }
    });

    canvas.addEventListener('mousemove', e => {
      const pt = svgPoint(e);

      if (epDrag) {
        if (!epDrag.moved &&
            Math.hypot(e.clientX - epDrag.startX, e.clientY - epDrag.startY) > 4) {
          epDrag.moved = true;
        }
        if (!epDrag.moved) return;
        const ed = state.edges[epDrag.edgeIdx];
        if (ed) {
          const a = DC.getNode(ed.from), b = DC.getNode(ed.to);
          if (a && b) {
            const aBox = a._box || (a.kind === 'class' ? DC.classBox(a) : DC.flowNodeBox(a));
            const bBox = b._box || (b.kind === 'class' ? DC.classBox(b) : DC.flowNodeBox(b));
            const ac = { x: a.x + aBox.width/2, y: a.y + aBox.height/2 };
            const bc = { x: b.x + bBox.width/2, y: b.y + bBox.height/2 };
            const p1 = ed.fromSide ? DC.sidePoint(a, aBox, ed.fromSide) : DC.intersectBoundary(ac, bc, a, aBox);
            const p2 = ed.toSide ? DC.sidePoint(b, bBox, ed.toSide) : DC.intersectBoundary(bc, ac, b, bBox);
            const from = epDrag.end === 'from' ? pt : p1;
            const to = epDrag.end === 'from' ? p2 : pt;
            epDrag.tempPath.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
          }
        }
        return;
      }

      if (wpDrag) {
        const ed = state.edges[wpDrag.edgeIdx];
        if (ed && ed.pts && ed.pts[wpDrag.wpIdx]) {
          ed.pts[wpDrag.wpIdx] = { x: pt.x, y: pt.y };
          DC.render();
        }
        return;
      }

      if (linkDrag) {
        if (!linkDrag.moved &&
            Math.hypot(e.clientX - linkDrag.startX, e.clientY - linkDrag.startY) > 4) {
          linkDrag.moved = true;
        }
        if (!linkDrag.moved) return;
        const fromNode = DC.getNode(linkDrag.from);
        if (fromNode) {
          const box = fromNode._box || (fromNode.kind === 'class' ? DC.classBox(fromNode) : DC.flowNodeBox(fromNode));
          const p1 = linkDrag.fromSide
            ? DC.sidePoint(fromNode, box, linkDrag.fromSide)
            : DC.intersectBoundary({ x: fromNode.x + box.width/2, y: fromNode.y + box.height/2 }, pt, fromNode, box);
          linkDrag.tempPath.setAttribute('d', `M ${p1.x} ${p1.y} L ${pt.x} ${pt.y}`);
        }
        return;
      }

      if (!drag) return;
      const obj = drag.kind === 'class' ? state.classes[drag.name] : state.nodes[drag.name];
      obj.x = pt.x - drag.offsetX;
      obj.y = pt.y - drag.offsetY;
      DC.render();
    });

    window.addEventListener('mouseup', e => {
      if (epDrag) {
        epDrag.tempPath?.remove();
        const moved = epDrag.moved;
        const ed = state.edges[epDrag.edgeIdx];
        if (ed && moved) {
          const portEl = e.target.closest?.('.port');
          const nodeEl = e.target.closest?.('[data-kind="class"], [data-kind="node"]');
          if (portEl) {
            const name = portEl.dataset.portNode;
            const side = portEl.dataset.portSide || null;
            const other = epDrag.end === 'from' ? ed.to : ed.from;
            if (name !== other) {
              if (epDrag.end === 'from') { ed.from = name; ed.fromSide = side; }
              else { ed.to = name; ed.toSide = side; }
              DC.updateCodeFromState();
            }
          } else if (nodeEl) {
            const name = nodeEl.dataset.name;
            const other = epDrag.end === 'from' ? ed.to : ed.from;
            if (name !== other) {
              const obj = DC.getNode(name);
              const box = obj._box || (obj.kind === 'class' ? DC.classBox(obj) : DC.flowNodeBox(obj));
              const side = DC.nearestSide(obj, box, svgPoint(e));
              if (epDrag.end === 'from') { ed.from = name; ed.fromSide = side; }
              else { ed.to = name; ed.toSide = side; }
              DC.updateCodeFromState();
            }
          } else {
            if (epDrag.end === 'from') ed.fromSide = null;
            else ed.toSide = null;
            DC.updateCodeFromState();
          }
        }
        epDrag = null;
        canvas.classList.remove('dragging');
        DC.render();
        return;
      }
      if (wpDrag) {
        wpDrag = null;
        canvas.classList.remove('dragging');
        DC.updateCodeFromState();
        return;
      }
      if (linkDrag) {
        if (!linkDrag.moved) {
          cyclePortSide(linkDrag.from, linkDrag.fromSide);
          linkDrag.tempPath?.remove();
          linkDrag = null;
          return;
        }
        const targetEl = e.target.closest?.('[data-kind="class"], [data-kind="node"]');
        if (targetEl) {
          const targetName = targetEl.dataset.name;
          if (targetName !== linkDrag.from) {
            const fromNode = DC.getNode(linkDrag.from);
            const toNode = DC.getNode(targetName);
            let type = 'flow';
            if (fromNode.kind === 'class' && toNode.kind === 'class') type = 'assoc';
            const toBox = toNode._box || (toNode.kind === 'class' ? DC.classBox(toNode) : DC.flowNodeBox(toNode));
            const toSide = DC.nearestSide(toNode, toBox, svgPoint(e));
            state.edges.push({
              from: linkDrag.from, fromSide: linkDrag.fromSide || null,
              to: targetName, toSide,
              type, label: ''
            });
            DC.updateCodeFromState();
            DC.render();
          }
        }
        linkDrag.tempPath?.remove();
        linkDrag = null;
        return;
      }
      if (drag) {
        drag = null;
        canvas.classList.remove('dragging');
        DC.updateCodeFromState();
      }
    });

    canvasWrap.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.min(4, Math.max(0.1, zoom * factor));
      if (newZoom === zoom) return;
      const rect = canvasWrap.getBoundingClientRect();
      const wx = e.clientX - rect.left;
      const wy = e.clientY - rect.top;
      const px = (canvasWrap.scrollLeft + wx) / zoom;
      const py = (canvasWrap.scrollTop + wy) / zoom;
      zoom = newZoom;
      applyZoom();
      canvasWrap.scrollLeft = px * zoom - wx;
      canvasWrap.scrollTop = py * zoom - wy;
    }, { passive: false });

    canvasWrap.addEventListener('mousedown', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      pan = { x: e.clientX, y: e.clientY, left: canvasWrap.scrollLeft, top: canvasWrap.scrollTop };
      canvasWrap.classList.add('panning');
    });

    window.addEventListener('mousemove', e => {
      if (!pan) return;
      canvasWrap.scrollLeft = pan.left - (e.clientX - pan.x);
      canvasWrap.scrollTop = pan.top - (e.clientY - pan.y);
    });

    window.addEventListener('mouseup', e => {
      if (e.button !== 1) return;
      pan = null;
      canvasWrap.classList.remove('panning');
    });

    canvas.addEventListener('dblclick', e => {
      const edgeEl = e.target.closest('.edge');
      if (edgeEl) {
        const idx = parseInt(edgeEl.dataset.idx);
        const ed = state.edges[idx];
        if (!ed) return;
        const newLabel = prompt('Подпись связи (пусто — удалить):', ed.label || '');
        if (newLabel !== null) {
          ed.label = newLabel.trim();
          DC.updateCodeFromState();
          DC.render();
        }
        return;
      }
      const nodeEl = e.target.closest('[data-kind="class"], [data-kind="node"]');
      if (!nodeEl) return;
      const kind = nodeEl.dataset.kind;
      const name = nodeEl.dataset.name;
      const newName = prompt('Переименовать:', name);
      if (!newName || newName === name) return;
      const store = kind === 'class' ? state.classes : state.nodes;
      if (store[newName]) return alert('Имя занято');
      const obj = store[name];
      obj.name = newName;
      store[newName] = obj;
      delete store[name];
      state.edges.forEach(ed => {
        if (ed.from === name) ed.from = newName;
        if (ed.to === name) ed.to = newName;
      });
      state.selected = { kind, id: newName };
      DC.updateCodeFromState();
      DC.render();
    });

    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!state.selected) return;
      const { kind, id } = state.selected;

      if (kind === 'class') {
        delete state.classes[id];
        state.edges = state.edges.filter(ed => ed.from !== id && ed.to !== id);
      } else if (kind === 'node') {
        delete state.nodes[id];
        state.edges = state.edges.filter(ed => ed.from !== id && ed.to !== id);
      } else if (kind === 'edge') {
        state.edges.splice(id, 1);
      }
      state.selected = null;
      DC.updateCodeFromState();
      DC.render();
    });

    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', item.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    canvasWrap.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      canvasWrap.classList.add('drop-target');
    });

    canvasWrap.addEventListener('dragleave', e => {
      if (!canvasWrap.contains(e.relatedTarget)) canvasWrap.classList.remove('drop-target');
    });

    canvasWrap.addEventListener('drop', e => {
      e.preventDefault();
      canvasWrap.classList.remove('drop-target');
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;

      const pt = svgPoint(e);
      const name = generateName(type);
      const id = ++state.lastId;

      if (type === 'class') {
        state.classes[name] = {
          kind: 'class', id, name, stereotype: '', attributes: ['+id: int'], methods: ['+action(): void'],
          x: pt.x, y: pt.y
        };
      } else {
        const defaultText = {
          start: '', end: '', process: 'action()', decision: 'условие?',
          io: 'read()', data: 'payload', predef: 'call()', doc: 'report',
          prep: 'setup', manual: 'step', note: 'text', connector: ''
        }[type] || '';
        state.nodes[name] = {
          kind: 'node', id, type, name, text: defaultText,
          x: pt.x, y: pt.y
        };
      }

      state.selected = { kind: type === 'class' ? 'class' : 'node', id: name };
      DC.updateCodeFromState();
      DC.render();
    });
  }

  DC.svgPoint = svgPoint;
  DC.generateName = generateName;
  DC.setupInteractions = setupInteractions;
})();

(function () {
  const PALETTE_W = 180;
  const CODE_MIN = 200;
  const handle = document.getElementById('code-resize');
  const codePanel = document.getElementById('code-panel');
  if (!handle || !codePanel) return;

  let resizing = false;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    resizing = true;
    handle.classList.add('resizing');
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const max = Math.max(CODE_MIN, window.innerWidth * 0.55);
    const w = Math.min(max, Math.max(CODE_MIN, e.clientX - PALETTE_W));
    document.body.classList.remove('code-collapsed');
    codePanel.classList.remove('collapsed');
    document.body.style.gridTemplateColumns = `${PALETTE_W}px ${w}px 1fr 240px`;
    const btn = document.getElementById('toggle-code');
    if (btn) { btn.textContent = '«'; btn.title = 'Свернуть'; }
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('resizing');
  });

  handle.addEventListener('dblclick', () => {
    document.body.style.gridTemplateColumns = '';
  });
})();
