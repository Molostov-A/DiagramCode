'use strict';
window.DC = window.DC || {};

DC.FLOW_KEYWORDS = ['start','end','process','decision','io','predef','doc','data','prep','manual','note','connector'];

(function () {
  const NAME = '[\\p{L}_][\\p{L}\\p{N}_]*';
  const KW = DC.FLOW_KEYWORDS.join('|');
  const CLASS_RE = new RegExp(`^class\\s+(?:#(\\d+)\\s+)?(${NAME})\\s*(?:«\\s*([^»]*?)\\s*»)?\\s*(\\{)?$`, 'u');
  const NODE_RE = new RegExp(`^(${KW})\\s+(?:#(\\d+)\\s+)?(${NAME})\\s*(?:([?:])\\s*(.*))?$`, 'u');
  const REF_ID_RE = /^#(\d+)$/u;
  const REF_NAME_RE = new RegExp(`^(${NAME})$`, 'u');
  const REL_RE = new RegExp(`^rel\\s+(#(\\d+)|${NAME})(?:\\.(top|right|bottom|left))?\\s*(-->|-\\|>|->|\\*--|o--|--)\\s*(#(\\d+)|${NAME})(?:\\.(top|right|bottom|left))?(?:\\s*\\{\\s*(auto|polyline|smooth|rect)\\s*\\})?\\s*(?::\\s*(.+))?$`, 'u');
  const FLOW_RE = new RegExp(`^flow\\s+(#(\\d+)|${NAME})(?:\\.(top|right|bottom|left))?\\s*(-->|->)\\s*(#(\\d+)|${NAME})(?:\\.(top|right|bottom|left))?(?:\\s*\\{\\s*(auto|polyline|smooth|rect)\\s*\\})?\\s*(?::\\s*(.+))?$`, 'u');
  const LAYOUT_RE = new RegExp(`^layout\\s+(#(\\d+)|${NAME})\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)$`, 'u');
  const ATTR_RE = /^([\w-]*)\/([\w-]*)\s*(?:\{([\w-]+)(?:\s+([\w-]+))?\})?\s*(?:"([^"]*)")?\s*$/u;
  const ROUTES = new Set(['auto', 'polyline', 'smooth', 'rect']);
  const EDGE_TYPES = new Set(['flow','flowDashed','assoc','dependency','inherit','composition','aggregation','link']);

  function splitArrow(s) {
    let inQ = false;
    for (let k = 0; k < s.length - 1; k++) {
      if (s[k] === '"') inQ = !inQ;
      if (!inQ && s[k] === '=' && s[k + 1] === '>') return [s.slice(0, k), s.slice(k + 2)];
    }
    return null;
  }

  function sideOf(v) {
    return (v && v !== '-') ? v : null;
  }

  DC.parseDSL = function (text) {
    const classes = {}, nodes = {}, edgesRaw = [], errors = [];
    const layoutMap = {};
    const idToName = {};
    const stack = [];
    let lastId = 0;
    const lines = text.split('\n');
    let i = 0;

    function takeId(explicit) {
      if (explicit) {
        const id = parseInt(explicit, 10);
        if (id > lastId) lastId = id;
        return id;
      }
      return ++lastId;
    }

    function makeClass(explicitId, name, stereotype) {
      const id = takeId(explicitId);
      idToName[id] = name;
      classes[name] = { kind: 'class', id, name, stereotype: stereotype || '', attributes: [], methods: [], x: 100, y: 100 };
      return classes[name];
    }

    function makeNode(kw, explicitId, name, text) {
      const id = takeId(explicitId);
      idToName[id] = name;
      nodes[name] = { kind: 'node', id, type: kw, name, text: (text || '').trim(), x: 100, y: 100 };
      return nodes[name];
    }

    function consumeBraceBody(target) {
      while (i < lines.length && lines[i].trim() !== '}') {
        const memLine = lines[i].trim();
        i++;
        if (!memLine || memLine.startsWith('#') || memLine.startsWith('//')) continue;
        if (memLine.includes('(')) target.methods.push(memLine);
        else target.attributes.push(memLine);
      }
      if (i < lines.length) i++;
    }

    function parseTarget(tok) {
      const ref = tok.match(REF_ID_RE);
      if (ref) return { ref: { id: parseInt(ref[1], 10) } };

      const cls = tok.match(CLASS_RE);
      if (cls) {
        const [, explicitId, name, stereotype, brace] = cls;
        const u = makeClass(explicitId, name, stereotype);
        if (brace) consumeBraceBody(u);
        return { node: u };
      }

      const nd = tok.match(NODE_RE);
      if (nd) {
        const [, kw, explicitId, name, , text] = nd;
        return { node: makeNode(kw, explicitId, name, text) };
      }

      const nm = tok.match(REF_NAME_RE);
      if (nm) return { ref: { name: nm[1] } };
      return null;
    }

    while (i < lines.length) {
      const raw = lines[i].replace(/\r$/, '');
      const line = raw.trim();
      i++;
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const depth = raw.length - raw.trimStart().length;

      if (line.startsWith('->')) {
        const parts = splitArrow(line);
        if (!parts) { errors.push(`Строка ${i}: неверная стрелка: "${line}"`); continue; }
        const attrs = parts[0].replace(/^->\s*/, '').match(ATTR_RE);
        const target = parseTarget(parts[1].trim());
        if (!attrs || !target) { errors.push(`Строка ${i}: не распознана стрелка: "${line}"`); continue; }

        let route = null, edgeType = null;
        for (const tok of [attrs[3], attrs[4]]) {
          if (!tok || tok === 'auto') continue;
          if (ROUTES.has(tok)) route = tok;
          else if (EDGE_TYPES.has(tok)) edgeType = tok;
          else errors.push(`Строка ${i}: неизвестный атрибут "${tok}"`);
        }

        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack.length ? stack[stack.length - 1].name : null;

        if (parent) {
          edgesRaw.push({
            fromTok: { name: parent },
            toTok: target.node ? { name: target.node.name } : target.ref,
            fromSide: sideOf(attrs[1]),
            toSide: sideOf(attrs[2]),
            route,
            label: attrs[5] || '',
            type: edgeType
          });
        }
        if (target.node) stack.push({ depth, name: target.node.name });
        continue;
      }

      const rel = line.match(REL_RE);
      if (rel) {
        const typeMap = { '-->':'dependency', '-|>':'inherit', '->':'assoc', '*--':'composition', 'o--':'aggregation', '--':'link' };
        edgesRaw.push({
          fromTok: rel[2] ? { id: parseInt(rel[2], 10) } : { name: rel[1] },
          toTok: rel[6] ? { id: parseInt(rel[6], 10) } : { name: rel[5] },
          fromSide: rel[3] || null, toSide: rel[7] || null,
          route: rel[8] === 'auto' ? null : (rel[8] || null),
          label: (rel[9] || '').trim(), type: typeMap[rel[4]]
        });
        continue;
      }

      const flow = line.match(FLOW_RE);
      if (flow) {
        edgesRaw.push({
          fromTok: flow[2] ? { id: parseInt(flow[2], 10) } : { name: flow[1] },
          toTok: flow[6] ? { id: parseInt(flow[6], 10) } : { name: flow[5] },
          fromSide: flow[3] || null, toSide: flow[7] || null,
          route: flow[8] === 'auto' ? null : (flow[8] || null),
          label: (flow[9] || '').trim(),
          type: flow[4] === '-->' ? 'flowDashed' : 'flow'
        });
        continue;
      }

      const layout = line.match(LAYOUT_RE);
      if (layout) {
        const name = layout[2] ? idToName[parseInt(layout[2], 10)] : layout[1];
        if (name) layoutMap[name] = { x: parseFloat(layout[3]), y: parseFloat(layout[4]) };
        continue;
      }

      const cls = line.match(CLASS_RE);
      if (cls) {
        const [, explicitId, name, stereotype, brace] = cls;
        const u = makeClass(explicitId, name, stereotype);
        if (brace) consumeBraceBody(u);
        stack.push({ depth, name });
        continue;
      }

      const nd = line.match(NODE_RE);
      if (nd) {
        const [, kw, explicitId, name, , text] = nd;
        makeNode(kw, explicitId, name, text);
        stack.push({ depth, name });
        continue;
      }

      errors.push(`Строка ${i}: не распознано: "${line}"`);
    }

    function resolveTok(tok) {
      if (!tok) return null;
      if (tok.id != null) {
        const n = idToName[tok.id];
        if (!n) { errors.push(`Нет блока #${tok.id}`); return null; }
        return n;
      }
      if (classes[tok.name] || nodes[tok.name]) return tok.name;
      errors.push(`Нет узла "${tok.name}"`);
      return null;
    }

    const edges = [];
    edgesRaw.forEach(e => {
      const from = resolveTok(e.fromTok);
      const to = resolveTok(e.toTok);
      if (!from || !to) return;
      let type = e.type;
      if (!type) type = (classes[from] && classes[to]) ? 'assoc' : 'flow';
      edges.push({ from, fromSide: e.fromSide, to, toSide: e.toSide, type, route: e.route, label: e.label });
    });

    const fixed = new Set();
    Object.entries(layoutMap).forEach(([name, pos]) => {
      const u = classes[name] || nodes[name];
      if (!u) return;
      u.x = pos.x;
      u.y = pos.y;
      fixed.add(name);
    });

    DC.autoLayout(classes, nodes, edges, fixed);
    return { classes, nodes, edges, errors, lastId };
  };
})();
