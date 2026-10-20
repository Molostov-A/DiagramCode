'use strict';
window.DC = window.DC || {};

(function () {
  const NAME = '[\\p{L}_][\\p{L}\\p{N}_]*';

  function arrowPrefix(ed) {
    const fs = ed.fromSide || '-';
    const ts = ed.toSide || '-';
    const natural = (ed.type === 'flow' || ed.type === 'flowDashed') ? 'flow' : 'assoc';
    const attrs = [ed.route, ed.type && ed.type !== natural ? ed.type : ''].filter(Boolean);
    const route = attrs.length ? ` {${attrs.join(' ')}}` : '';
    const label = ed.label ? ` "${String(ed.label).replace(/"/g, "'")}"` : '';
    return `-> ${fs}/${ts}${route}${label} => `;
  }

  function nodeDecl(u) {
    if (u.kind === 'class') {
      const stereo = u.stereotype ? ` «${u.stereotype}»` : '';
      return { head: `class #${u.id} ${u.name}${stereo} {`, body: [...u.attributes, ...(u.attributes.length && u.methods.length ? [''] : []), ...u.methods] };
    }
    const sep = u.type === 'decision' ? '?' : ':';
    return { head: `${u.type} #${u.id} ${u.name}${u.text ? ` ${sep} ${u.text}` : ''}`, body: null };
  }

  function emitDeclaration(lines, u, depth) {
    const pad = '  '.repeat(depth);
    const d = nodeDecl(u);
    lines.push(pad + d.head);
    if (d.body) {
      d.body.forEach(b => lines.push(pad + '  ' + b));
      lines.push(pad + '}');
    }
  }

  DC.stateToCode = function () {
    const state = DC.state;
    const all = { ...state.classes, ...state.nodes };
    const lines = [];

    const out = {};
    state.edges.forEach(ed => {
      if (!all[ed.from] || !all[ed.to]) return;
      (out[ed.from] = out[ed.from] || []).push(ed);
    });

    const visited = new Set();
    const emitted = new Set();
    const isEnd = ed => all[ed.to]?.kind === 'node' && all[ed.to].type === 'end';

    function walk(name, depth) {
      visited.add(name);
      const outs = (out[name] || []).filter(e => !emitted.has(e) || !visited.has(e.to));
      outs.sort((a, b) => (isEnd(a) ? 1 : 0) - (isEnd(b) ? 1 : 0));

      outs.forEach(ed => {
        if (emitted.has(ed)) return;
        emitted.add(ed);
        const target = all[ed.to];
        const pad = '  '.repeat(depth + 1);
        if (visited.has(ed.to)) {
          lines.push(`${pad}${arrowPrefix(ed)}#${target.id}`);
          return;
        }
        const d = nodeDecl(target);
        lines.push(`${pad}${arrowPrefix(ed)}${d.head}`);
        if (d.body) {
          d.body.forEach(b => lines.push(`${pad}  ${b}`));
          lines.push(`${pad}}`);
        }
        walk(ed.to, depth + 1);
      });
    }

    const byId = (a, b) => (a.id || 0) - (b.id || 0);
    let roots = Object.values(state.nodes).filter(n => n.type === 'start').sort(byId);
    if (!roots.length) {
      const hasIn = new Set(state.edges.map(e => e.to));
      roots = Object.values(all).filter(u => !hasIn.has(u.name)).sort(byId);
    }
    if (!roots.length && Object.keys(all).length) {
      roots = [Object.values(all).sort(byId)[0]];
    }

    lines.push('# Логическая схема');
    roots.forEach(root => {
      emitDeclaration(lines, root, 0);
      walk(root.name, 0);
    });

    const leftovers = Object.values(all).filter(u => !visited.has(u.name)).sort(byId);
    if (leftovers.length) {
      lines.push('');
      lines.push('# Отдельные блоки');
      leftovers.forEach(u => emitDeclaration(lines, u, 0));
    }

    const strayEdges = state.edges.filter(ed => !emitted.has(ed) && all[ed.from] && all[ed.to]);
    if (strayEdges.length) {
      lines.push('');
      lines.push('# Прочие связи');
      const rev = {
        dependency:'-->', inherit:'-|>', assoc:'->', composition:'*--', aggregation:'o--', link:'--',
        flow:'->', flowDashed:'-->'
      };
      strayEdges.forEach(ed => {
        const op = rev[ed.type] || '->';
        const kw = (ed.type === 'flow' || ed.type === 'flowDashed') ? 'flow' : 'rel';
        const fromBase = `#${all[ed.from].id}`;
        const toBase = `#${all[ed.to].id}`;
        const from = ed.fromSide ? `${fromBase}.${ed.fromSide}` : fromBase;
        const to = ed.toSide ? `${toBase}.${ed.toSide}` : toBase;
        const route = ed.route ? ` {${ed.route}}` : '';
        const label = ed.label ? ` : ${ed.label}` : '';
        lines.push(`${kw} ${from} ${op} ${to}${route}${label}`);
      });
    }

    const names = Object.keys(all);
    if (names.length) {
      lines.push('');
      lines.push('# Расположение');
      names.forEach(name => {
        const u = all[name];
        lines.push(`layout #${u.id} ${Math.round(u.x)} ${Math.round(u.y)}`);
      });
    }

    return lines.join('\n');
  };

  DC.updateCodeFromState = function () {
    const codeEl = document.getElementById('code');
    if (codeEl) codeEl.value = DC.stateToCode();
  };
})();
