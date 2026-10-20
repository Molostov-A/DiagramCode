'use strict';
window.DC = window.DC || {};

DC.stateToCode = function () {
  const lines = [];
  const state = DC.state;

  Object.values(state.classes).forEach(cls => {
    const stereo = cls.stereotype ? ` «${cls.stereotype}»` : '';
    lines.push(`class ${cls.name}${stereo} {`);
    cls.attributes.forEach(a => lines.push(`  ${a}`));
    if (cls.attributes.length && cls.methods.length) lines.push('');
    cls.methods.forEach(m => lines.push(`  ${m}`));
    lines.push('}');
    lines.push('');
  });

  if (Object.keys(state.nodes).length) {
    if (lines.length) lines.push('');
    Object.values(state.nodes).forEach(n => {
      const sep = n.type === 'decision' ? '?' : ':';
      if (n.text) lines.push(`${n.type} ${n.name} ${sep} ${n.text}`);
      else        lines.push(`${n.type} ${n.name}`);
    });
    lines.push('');
  }

  if (state.edges.length) {
    lines.push('# Связи');
    const rev = {
      dependency:'-->', inherit:'-|>', assoc:'->', composition:'*--', aggregation:'o--', link:'--',
      flow:'->', flowDashed:'-->'
    };
    state.edges.forEach(ed => {
      const op = rev[ed.type] || '->';
      const isFlow = ed.type === 'flow' || ed.type === 'flowDashed';
      const kw = isFlow ? 'flow' : 'rel';
      const from = ed.fromSide ? `${ed.from}.${ed.fromSide}` : ed.from;
      const to = ed.toSide ? `${ed.to}.${ed.toSide}` : ed.to;
      const route = ed.route ? ` {${ed.route}}` : '';
      const label = ed.label ? ` : ${ed.label}` : '';
      lines.push(`${kw} ${from} ${op} ${to}${route}${label}`);
    });
    lines.push('');
  }

  const allNodes = { ...state.classes, ...state.nodes };
  const names = Object.keys(allNodes);
  if (names.length) {
    lines.push('# Расположение');
    names.forEach(n => {
      const u = allNodes[n];
      lines.push(`layout ${n} ${Math.round(u.x)} ${Math.round(u.y)}`);
    });
  }

  return lines.join('\n');
};

DC.updateCodeFromState = function () {
  const codeEl = document.getElementById('code');
  if (codeEl) codeEl.value = DC.stateToCode();
};
