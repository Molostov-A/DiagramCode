'use strict';
window.DC = window.DC || {};

(function () {
  const state = DC.state;
  let drag = null;
  let linkDrag = null;

  function svgPoint(e) {
    const rect = DC.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

  function setupInteractions() {
    const canvas = DC.canvas;
    const canvasWrap = DC.canvasWrap;

    canvas.addEventListener('mousedown', e => {
      const portEl = e.target.closest('.port');
      if (portEl) {
        e.preventDefault();
        e.stopPropagation();
        const fromName = portEl.dataset.portNode;
        linkDrag = { from: fromName };
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

      if (linkDrag) {
        const fromNode = DC.getNode(linkDrag.from);
        if (fromNode) {
          const box = fromNode._box || (fromNode.kind === 'class' ? DC.classBox(fromNode) : DC.flowNodeBox(fromNode));
          const fc = { x: fromNode.x + box.width/2, y: fromNode.y + box.height/2 };
          const p1 = DC.intersectBoundary(fc, pt, fromNode, box);
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
      if (linkDrag) {
        const targetEl = e.target.closest?.('[data-kind="class"], [data-kind="node"]');
        if (targetEl) {
          const targetName = targetEl.dataset.name;
          if (targetName !== linkDrag.from) {
            const fromNode = DC.getNode(linkDrag.from);
            const toNode = DC.getNode(targetName);
            let type = 'flow';
            if (fromNode.kind === 'class' && toNode.kind === 'class') type = 'assoc';
            state.edges.push({ from: linkDrag.from, to: targetName, type, label: '' });
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

      if (type === 'class') {
        state.classes[name] = {
          kind: 'class', name, stereotype: '', attributes: ['+id: int'], methods: ['+action(): void'],
          x: pt.x, y: pt.y
        };
      } else {
        const defaultText = {
          start: '', end: '', process: 'action()', decision: 'условие?',
          io: 'read()', data: 'payload', predef: 'call()', doc: 'report',
          prep: 'setup', manual: 'step', note: 'text', connector: ''
        }[type] || '';
        state.nodes[name] = {
          kind: 'node', type, name, text: defaultText,
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
