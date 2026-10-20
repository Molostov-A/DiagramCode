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
    let panCandidate = null;
    let pinch = null;
    let tapStart = null;
    let lastTap = null;
    const pointers = new Map();

    function elementAt(e) {
      return document.elementFromPoint(e.clientX, e.clientY);
    }

    function zoomAt(clientX, clientY, newZoom) {
      const z = Math.min(4, Math.max(0.1, newZoom));
      if (z === zoom) return;
      const rect = canvasWrap.getBoundingClientRect();
      const wx = clientX - rect.left;
      const wy = clientY - rect.top;
      const px = (canvasWrap.scrollLeft + wx) / zoom;
      const py = (canvasWrap.scrollTop + wy) / zoom;
      zoom = z;
      applyZoom();
      canvasWrap.scrollLeft = px * zoom - wx;
      canvasWrap.scrollTop = py * zoom - wy;
    }

    function zoomBy(factor) {
      const rect = canvasWrap.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, zoom * factor);
    }

    function centerPt() {
      return {
        x: (canvasWrap.scrollLeft + canvasWrap.clientWidth / 2) / zoom,
        y: (canvasWrap.scrollTop + canvasWrap.clientHeight / 2) / zoom
      };
    }

    function createNode(type, pt) {
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
    }

    function tapKey(el) {
      if (!el || !el.closest) return null;
      if (el.closest('.port, .edge-wp, .edge-ep')) return null;
      const edgeEl = el.closest('.edge');
      if (edgeEl) return 'edge:' + edgeEl.dataset.idx;
      const nodeEl = el.closest('[data-kind="class"], [data-kind="node"]');
      if (nodeEl) return nodeEl.dataset.kind + ':' + nodeEl.dataset.name;
      return null;
    }

    function activateEdit(target) {
      if (!target || !target.closest) return;
      const edgeEl = target.closest('.edge');
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
      const nodeEl = target.closest('[data-kind="class"], [data-kind="node"]');
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
    }

    function cancelGestures() {
      if (epDrag) { epDrag.tempPath?.remove(); epDrag = null; }
      if (linkDrag) { linkDrag.tempPath?.remove(); linkDrag = null; }
      if (wpDrag) wpDrag = null;
      drag = null;
      pan = null;
      panCandidate = null;
      tapStart = null;
      canvas.classList.remove('dragging');
      canvasWrap.classList.remove('panning');
    }

    // --- отслеживание пальцев / пинч-зум ---
    document.addEventListener('pointerdown', e => {
      if (!canvasWrap.contains(e.target)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        cancelGestures();
        const pts = [...pointers.values()];
        pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, z: zoom };
      }
    }, true);

    document.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch) return;
      const pts = [...pointers.values()].slice(0, 2);
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, pinch.z * (d / pinch.d));
    }, true);

    function forgetPointer(e) {
      pointers.delete(e.pointerId);
      if (pinch && pointers.size < 2) pinch = null;
    }
    document.addEventListener('pointerup', forgetPointer, true);
    document.addEventListener('pointercancel', e => {
      forgetPointer(e);
      cancelGestures();
      lastTap = null;
    }, true);

    // --- нажатие на холст ---
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (pinch || pointers.size > 1) return;
      if (e.pointerType !== 'mouse') {
        e.preventDefault();
        tapStart = {
          pointerId: e.pointerId, x: e.clientX, y: e.clientY,
          moved: false, key: tapKey(e.target)
        };
        // render() заменяет DOM-узлы — фиксируем указатель за canvas,
        // чтобы жест не оборвался при удалении первоначальной цели
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      }

      const epEl = e.target.closest('.edge-ep');
      if (epEl) {
        e.preventDefault();
        e.stopPropagation();
        const edgeIdx = parseInt(epEl.dataset.edgeIdx);
        const ed = state.edges[edgeIdx];
        if (!ed) return;
        state.selected = { kind: 'edge', id: edgeIdx };
        epDrag = { edgeIdx, end: epEl.dataset.end, startX: e.clientX, startY: e.clientY, moved: false };
        epDrag.tempPath = DC.el('path', { id: 'temp-edge', d: '' }, canvas);
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
        linkDrag.tempPath = DC.el('path', { id: 'temp-edge', d: '' }, canvas);
        canvas.classList.add('dragging');
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
        drag = { kind, name, offsetX: pt.x - obj.x, offsetY: pt.y - obj.y, moved: false };
        canvas.classList.add('dragging');
        DC.render();
      } else if (edgeEl) {
        state.selected = { kind: 'edge', id: parseInt(edgeEl.dataset.idx) };
        DC.render();
      } else {
        panCandidate = {
          pointerId: e.pointerId, x: e.clientX, y: e.clientY,
          left: canvasWrap.scrollLeft, top: canvasWrap.scrollTop,
          moved: false
        };
      }
    });

    // --- перемещение ---
    document.addEventListener('pointermove', e => {
      if (pinch) return;

      if (tapStart && e.pointerId === tapStart.pointerId &&
          Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 6) {
        tapStart.moved = true;
      }

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

      if (drag) {
        const obj = drag.kind === 'class' ? state.classes[drag.name] : state.nodes[drag.name];
        obj.x = pt.x - drag.offsetX;
        obj.y = pt.y - drag.offsetY;
        drag.moved = true;
        DC.render();
        return;
      }

      if (panCandidate && !pan && e.pointerId === panCandidate.pointerId &&
          Math.hypot(e.clientX - panCandidate.x, e.clientY - panCandidate.y) > 4) {
        panCandidate.moved = true;
        pan = { pointerId: panCandidate.pointerId, x: panCandidate.x, y: panCandidate.y,
                left: panCandidate.left, top: panCandidate.top };
        canvasWrap.classList.add('panning');
      }
      if (pan && e.pointerId === pan.pointerId) {
        canvasWrap.scrollLeft = pan.left - (e.clientX - pan.x);
        canvasWrap.scrollTop = pan.top - (e.clientY - pan.y);
      }
    });

    // --- отпускание ---
    document.addEventListener('pointerup', e => {
      if (epDrag) {
        epDrag.tempPath?.remove();
        const moved = epDrag.moved;
        const ed = state.edges[epDrag.edgeIdx];
        if (ed && moved) {
          const hit = elementAt(e);
          const portEl = hit?.closest?.('.port');
          const nodeEl = hit?.closest?.('[data-kind="class"], [data-kind="node"]');
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
      } else if (wpDrag) {
        wpDrag = null;
        canvas.classList.remove('dragging');
        DC.updateCodeFromState();
      } else if (linkDrag) {
        if (!linkDrag.moved) {
          cyclePortSide(linkDrag.from, linkDrag.fromSide);
          linkDrag.tempPath?.remove();
          linkDrag = null;
          canvas.classList.remove('dragging');
        } else {
          const targetEl = elementAt(e)?.closest?.('[data-kind="class"], [data-kind="node"]');
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
          canvas.classList.remove('dragging');
        }
      } else if (drag) {
        drag = null;
        canvas.classList.remove('dragging');
        DC.updateCodeFromState();
      }

      if (pan && e.pointerId === pan.pointerId) {
        pan = null;
        canvasWrap.classList.remove('panning');
      }

      if (panCandidate && e.pointerId === panCandidate.pointerId) {
        if (!panCandidate.moved) {
          state.selected = null;
          DC.render();
        }
        panCandidate = null;
      }

      if (tapStart && e.pointerId === tapStart.pointerId && e.pointerType !== 'mouse') {
        if (!tapStart.moved && tapStart.key) {
          const now = Date.now();
          if (lastTap && lastTap.key === tapStart.key && now - lastTap.t < 350 &&
              Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 48) {
            const target = elementAt(e);
            if (target) activateEdit(target);
            lastTap = null;
          } else {
            lastTap = { t: now, key: tapStart.key, x: e.clientX, y: e.clientY };
          }
        }
        tapStart = null;
      }
    });

    // --- колесо ---
    canvasWrap.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX, e.clientY, zoom * factor);
    }, { passive: false });

    // --- пан средней кнопкой ---
    canvasWrap.addEventListener('pointerdown', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      pan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY,
              left: canvasWrap.scrollLeft, top: canvasWrap.scrollTop };
      canvasWrap.classList.add('panning');
    });

    // --- редактирование по двойному клику / двойному тапу ---
    canvas.addEventListener('dblclick', e => activateEdit(e.target));

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

    // --- палитра: drag&drop (мышь) и тап (тач) ---
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', item.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });

      let palTap = null;
      item.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        const scroller = item.closest('#palette');
        palTap = { y: e.clientY, t: Date.now(), top: scroller ? scroller.scrollTop : 0 };
      });
      item.addEventListener('pointerup', e => {
        if (e.pointerType === 'mouse' || !palTap) { palTap = null; return; }
        const scroller = item.closest('#palette');
        const scrolled = scroller ? Math.abs(scroller.scrollTop - palTap.top) : 999;
        if (Math.abs(e.clientY - palTap.y) < 8 && scrolled < 6 && Date.now() - palTap.t < 700) {
          createNode(item.dataset.type, centerPt());
        }
        palTap = null;
      });
      item.addEventListener('pointercancel', () => { palTap = null; });
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
      createNode(type, svgPoint(e));
    });

    DC.zoomBy = zoomBy;
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

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    resizing = true;
    handle.classList.add('resizing');
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', e => {
    if (!resizing) return;
    const max = Math.max(CODE_MIN, window.innerWidth * 0.55);
    const w = Math.min(max, Math.max(CODE_MIN, e.clientX - PALETTE_W));
    document.body.classList.remove('code-collapsed');
    codePanel.classList.remove('collapsed');
    document.body.style.gridTemplateColumns = `${PALETTE_W}px ${w}px 1fr 240px`;
    const btn = document.getElementById('toggle-code');
    if (btn) { btn.textContent = '«'; btn.title = 'Свернуть'; }
  });

  function stopResize() {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('resizing');
  }
  handle.addEventListener('pointerup', stopResize);
  handle.addEventListener('pointercancel', stopResize);

  handle.addEventListener('dblclick', () => {
    document.body.style.gridTemplateColumns = '';
  });
})();
