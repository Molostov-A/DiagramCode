'use strict';
window.DC = window.DC || {};

DC.autoLayout = function (classes, nodes, edges, fixed) {
  const allNodes = { ...classes, ...nodes };
  const names = Object.keys(allNodes);
  if (!names.length) return;
  const level = {};
  names.forEach(n => level[n] = 0);
  let changed = true, guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (const e of edges) {
      if (level[e.to] === undefined || level[e.from] === undefined) continue;
      const want = level[e.from] + 1;
      if (level[e.to] < want && want < 50) { level[e.to] = want; changed = true; }
    }
  }
  const byLevel = {};
  names.forEach(n => (byLevel[level[n]] ||= []).push(n));
  const COL_W = 260, ROW_H = 200;
  Object.entries(byLevel).forEach(([lvl, arr]) => {
    let idx = 0;
    arr.forEach(n => {
      if (fixed && fixed.has(n)) return;
      allNodes[n].x = 80 + parseInt(lvl) * COL_W;
      allNodes[n].y = 60 + idx * ROW_H;
      idx++;
    });
  });
};
