'use strict';
window.DC = window.DC || {};

DC.defaultTheme = function () {
  return {
    paletteMode: false,
    fill: '',
    stroke: '',
    strokeWidth: '',
    textColor: '',
    fontSize: '',
    fontFamily: '',
    bold: false,
    edgeColor: '',
    edgeWidth: '',
    edgeDashed: ''
  };
};

DC.getTheme = function () {
  return Object.assign(DC.defaultTheme(), DC.state.theme || {});
};

DC.state = {
  classes: {},
  nodes: {},
  edges: [],
  theme: {},
  selected: null,
  lastId: 0,
  _nodeCounter: 0
};
