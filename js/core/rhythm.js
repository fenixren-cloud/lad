// rhythm.js — расчёт теста ритма и проверки «чисто ли сыграно» для лестницы темпа. Чистая логика.

/**
 * Сопоставить удары с ожидаемыми моментами: пары подбираются жадно по наименьшему отклонению;
 * окно — половина наименьшего интервала между ожидаемыми ударами (не больше 250 мс).
 * @param {number[]} expected времена ожидаемых ударов, с
 * @param {number[]} taps времена реальных ударов, с
 * @param {{ window?: number | null }} [opts]
 */
export function analyzeTaps(expected, taps, { window = null } = {}) {
  const E = [...expected].sort((a, b) => a - b), T = [...taps].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < E.length; i++) minGap = Math.min(minGap, E[i] - E[i - 1]);
  const W = window ?? Math.min(0.25, Number.isFinite(minGap) ? minGap / 2 : 0.25);
  const pairs = [];
  let lo = 0;
  T.forEach((t, j) => {
    while (lo < E.length && E[lo] < t - W) lo++;
    for (let i = lo; i < E.length && E[i] <= t + W; i++) pairs.push({ i, j, d: Math.abs(t - E[i]) });
  });
  pairs.sort((a, b) => a.d - b.d);
  const usedE = new Set(), usedT = new Set(), hits = [];
  for (const p of pairs) {
    if (usedE.has(p.i) || usedT.has(p.j)) continue;
    usedE.add(p.i); usedT.add(p.j);
    hits.push({ i: p.i, expected: E[p.i], tap: T[p.j], dev: T[p.j] - E[p.i] });
  }
  hits.sort((a, b) => a.i - b.i);
  const devs = hits.map(h => h.dev), n = devs.length;
  const mean = n ? devs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n ? Math.sqrt(devs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
  const meanAbs = n ? devs.reduce((a, b) => a + Math.abs(b), 0) / n : 0;
  const missed = E.length - n, extra = T.length - n;
  const accuracy = E.length ? n / E.length : 0;
  const score = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, meanAbs * 1000 - 5) * 1.4 - (1 - accuracy) * 60 - extra * 2)));
  return { hits, missed, extra, mean, sd, meanAbs, accuracy, score, grade: gradeOf({ n, accuracy, mean, sd }), window: W };
}

/**
 * Оценка словами. Ровно, но всё со сдвигом ≥ 50 мс — почти всегда задержка устройства, а не руки:
 * честный совет «сделай калибровку», а не «0 из 100».
 */
export function gradeOf({ n, accuracy, mean, sd }) {
  const msSd = sd * 1000;
  if (!n) return 'Нет попаданий';
  if (accuracy < 0.6) return 'Много пропусков — замедли темп';
  if (msSd < 20 && Math.abs(mean) >= 0.05) return 'Ровно, но со сдвигом — сделай калибровку';
  if (msSd < 12 && Math.abs(mean) < 0.015) return 'Отлично — как машина';
  if (msSd < 20) return 'Очень хорошо';
  if (msSd < 30) return 'Хорошо';
  if (msSd < 45) return 'Неплохо';
  return 'Тренируйся медленнее';
}

/** Калибровка задержки: медиана отклонений ударов от кликов (нужно не меньше 5 попаданий) */
export function calibrate(clicks, taps) {
  const r = analyzeTaps(clicks, taps);
  if (r.hits.length < 5) return null;
  const d = r.hits.map(h => h.dev).sort((a, b) => a - b), m = d.length >> 1;
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2;
}

/**
 * Какие удары считать: во время отсчёта и после конца (гитара ещё звучит) — не считаются.
 * Окно — от первой ожидаемой доли −0,3 с до последней +0,3 с.
 */
export function tapsInWindow(expected, taps, margin = 0.3) {
  if (!expected.length) return [];
  const lo = Math.min(...expected) - margin, hi = Math.max(...expected) + margin;
  return taps.filter(t => t >= lo && t <= hi);
}

/**
 * «Чисто сыграно» для лестницы темпа: все ожидаемые удары на месте, каждый — в пределах ±tolMs,
 * лишних не больше одного (случайный звук).
 */
export function isClean(expected, taps, { tolMs = 40, latency = 0 } = {}) {
  const r = analyzeTaps(expected, tapsInWindow(expected, taps.map(t => t - latency)));
  const clean = r.missed === 0 && r.extra <= 1 && r.hits.every(h => Math.abs(h.dev) * 1000 <= tolMs);
  return { clean, ...r };
}

// ---------- ритмические фигуры для теста ритма (на долю) ----------
/** q — четверть, ee — две восьмые, r — пауза, re — пауза + восьмая, er — восьмая + пауза, tr — триоль */
export const FIGURES = Object.freeze({ q: [0], ee: [0, 0.5], r: [], re: [0.5], er: [0], tr: [0, 1 / 3, 2 / 3] });

/** Случайная фигура на 4 доли: не больше одной паузы и не одни четверти */
export function randomFigure(rand = Math.random) {
  const opts = ['q', 'ee', 'r', 're', 'er', 'ee', 'q'];
  for (let tries = 0; tries < 50; tries++) {
    const f = Array.from({ length: 4 }, () => opts[Math.floor(rand() * opts.length)]);
    if (f.filter(x => x === 'r').length <= 1 && !f.every(x => x === 'q')) return f;
  }
  return ['q', 'ee', 'q', 're']; // если случайность «застряла» — простая фигура
}
/** Моменты ударов фигуры в долях: ['q','ee'] → [0, 1, 1.5] */
export const figureOnsets = fig => fig.flatMap((k, beat) => FIGURES[k].map(o => beat + o));

/** Режимы теста ритма */
/** @type {[string, string][]} */
export const RHYTHM_MODES = [['quarters', 'Четверти'], ['eighths', 'Восьмые'], ['offbeats', 'Только «и»'], ['gaps', 'С пропусками клика'], ['figures', 'Фигуры']];

/**
 * План теста: на каждый такт (4 доли) — где звучит клик и где ждём удар (в долях от начала такта).
 * С пропусками клика: 2 такта щёлкает, 2 молчит — а удары ждём всё время.
 * @param {string} mode @param {number} bars @param {() => number} [rand]
 * @returns {{ clicks: number[], expected: number[], figure: string[] | null }[]}
 */
export function rhythmPlan(mode, bars, rand = Math.random) {
  const beats = [0, 1, 2, 3];
  return Array.from({ length: bars }, (_, b) => {
    switch (mode) {
      case 'eighths': return { clicks: beats, expected: beats.flatMap(x => [x, x + 0.5]), figure: null };
      case 'offbeats': return { clicks: beats, expected: beats.map(x => x + 0.5), figure: null };
      case 'gaps': return { clicks: b % 4 < 2 ? beats : [], expected: beats, figure: null };
      case 'figures': { const f = randomFigure(rand); return { clicks: beats, expected: figureOnsets(f), figure: f }; }
      default: return { clicks: beats, expected: beats, figure: null };
    }
  });
}
