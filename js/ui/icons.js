// icons.js — набор иконок «Графита»: контур 24×24, цвет — от текста.
import { h } from './dom.js';

/** Шестерёнка: 8 зубцов, считается один раз */
function gearPath(teeth = 8, rOut = 9.6, rIn = 7.4) {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    for (const [da, r] of [[-0.36, rIn], [-0.17, rOut], [0.17, rOut], [0.36, rIn]]) {
      pts.push(`${(12 + r * Math.cos(a + da)).toFixed(2)} ${(12 + r * Math.sin(a + da)).toFixed(2)}`);
    }
  }
  return `<path d="M${pts.join('L')}Z"/><circle cx="12" cy="12" r="3"/>`;
}

const PATHS = {
  today: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>',
  theory: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
  play: '<path d="M12 21c-3-3-7-7.5-7-11.5a7 7 0 0 1 14 0c0 4-4 8.5-7 11.5z"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3.5-3.5 4-3.5 7.5a3 3 0 0 1-6 0"/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.5-2 2-2 3"/>',
  progress: '<path d="M5 20v-6M10 20V8M15 20v-9M20 20V4M3 20h18"/>',
  gear: gearPath(),
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const FILLED = {
  playFill: '<path d="M7 4.5v15l12.5-7.5z"/>',
  stopFill: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
};

/**
 * @param {keyof typeof PATHS | keyof typeof FILLED} name
 * @param {number} [size]
 */
export function icon(name, size = 24) {
  const filled = name in FILLED;
  const svg = h('svg:svg', {
    class: 'ico', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
    fill: filled ? 'currentColor' : 'none', stroke: filled ? 'none' : 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  svg.innerHTML = filled ? FILLED[name] : PATHS[name];
  return svg;
}
