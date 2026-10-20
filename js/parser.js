'use strict';
window.DC = window.DC || {};

DC.FLOW_KEYWORDS = ['start','end','process','decision','io','predef','doc','data','prep','manual','note','connector'];

DC.parseDSL = function (text) {
  const classes = {}, nodes = {}, edges = [], errors = [];
  const layoutMap = {};
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const classMatch = line.match(/^class\s+([\p{L}_][\p{L}\p{N}_]*)\s*(?:«\s*([^»]*?)\s*»)?\s*\{?$/u);
    if (classMatch) {
      const [, name, stereotype] = classMatch;
      const cls = { kind: 'class', name, stereotype: stereotype || '', attributes: [], methods: [], x: 100, y: 100 };
      if (line.endsWith('{')) {
        while (i < lines.length && !lines[i].trim().startsWith('}')) {
          const memLine = lines[i].trim();
          i++;
          if (!memLine) continue;
          if (memLine.includes('(')) cls.methods.push(memLine);
          else cls.attributes.push(memLine);
        }
        if (i < lines.length) i++;
      }
      classes[name] = cls;
      continue;
    }

    const relMatch = line.match(/^rel\s+([\p{L}_][\p{L}\p{N}_]*)(?:\.(top|right|bottom|left))?\s*(-->|-\|>|->|\*--|o--|--)\s*([\p{L}_][\p{L}\p{N}_]*)(?:\.(top|right|bottom|left))?(?:\s*\{\s*(auto|polyline|smooth|rect)\s*\})?\s*(?::\s*(.+))?$/u);
    if (relMatch) {
      const [, from, fromSide, type, to, toSide, route, label] = relMatch;
      const typeMap = { '-->':'dependency', '-|>':'inherit', '->':'assoc', '*--':'composition', 'o--':'aggregation', '--':'link' };
      edges.push({ from, fromSide: fromSide || null, to, toSide: toSide || null, type: typeMap[type], route: route === 'auto' ? null : (route || null), label: label?.trim() || '' });
      continue;
    }

    const layoutMatch = line.match(/^layout\s+([\p{L}_][\p{L}\p{N}_]*)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/u);
    if (layoutMatch) {
      const [, name, x, y] = layoutMatch;
      layoutMap[name] = { x: parseFloat(x), y: parseFloat(y) };
      continue;
    }

    let matched = false;
    for (const kw of DC.FLOW_KEYWORDS) {
      const re = new RegExp(`^${kw}\\s+([\\p{L}_][\\p{L}\\p{N}_]*)\\s*(?:([?:])\\s*(.*))?$`, 'u');
      const m = line.match(re);
      if (m) {
        const [, name, sep, text] = m;
        nodes[name] = { kind: 'node', type: kw, name, text: text?.trim() || '', x: 100, y: 100 };
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const flowMatch = line.match(/^flow\s+([\p{L}_][\p{L}\p{N}_]*)(?:\.(top|right|bottom|left))?\s*(-->|->)\s*([\p{L}_][\p{L}\p{N}_]*)(?:\.(top|right|bottom|left))?(?:\s*\{\s*(auto|polyline|smooth|rect)\s*\})?\s*(?::\s*(.+))?$/u);
    if (flowMatch) {
      const [, from, fromSide, op, to, toSide, route, label] = flowMatch;
      edges.push({ from, fromSide: fromSide || null, to, toSide: toSide || null, type: op === '-->' ? 'flowDashed' : 'flow', route: route === 'auto' ? null : (route || null), label: label?.trim() || '' });
      continue;
    }

    errors.push(`Строка ${i}: не распознано: "${line}"`);
  }

  const allNames = new Set([...Object.keys(classes), ...Object.keys(nodes)]);
  edges.forEach(e => {
    if (!allNames.has(e.from)) errors.push(`Нет узла "${e.from}"`);
    if (!allNames.has(e.to))   errors.push(`Нет узла "${e.to}"`);
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
  return { classes, nodes, edges, errors };
};
