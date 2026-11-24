// theory-kit.js — общие детали экранов «Теории»: быстрые переключатели над грифом (строй, подписи),
// выбор тоники из 12 нот, гриф и круг, которые следуют настройкам, кнопка «Послушать», показ сцены урока
// (круг, гриф, фишки, сетка) и список уроков темы с отметками «пройден».
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { segmented, card, linkRow } from '../ui/components.js';
import { createFretboard } from '../ui/fretboard.js';
import { createDial } from '../ui/dial.js';
import { CHOICES } from '../core/settings.js';
import { TUNINGS } from '../core/neck.js';
import { lessonsOf, lessonCtx } from '../core/lessons.js';
import { settings, setSetting, settingSignal } from '../app/state.js';
import { store } from '../app/store.js';
import { example, playExample, stopExample } from '../audio/theoryplayer.js';

/** Контекст для расчётов теории из текущих настроек */
export const theoryCtx = (rand = Math.random) => lessonCtx(settings.value, rand);
export const german = () => settings.value.notation === 'german';

/** Быстрые переключатели над грифом: строй и подписи (те же, что в настройках) */
export function quickSettings(keys = ['tuning', 'labels']) {
  return h('div', { class: 'quick' }, ...keys.map(k => segmented({ label: CHOICES[k].title, name: k, options: CHOICES[k].options, sig: settingSignal(k), onchange: v => setSetting(k, v) })));
}

/**
 * Ряд из 12 нот (или любых вариантов) кнопками-фишками.
 * @param {{ label: string, name: string, options: [string, string][], sig: { value: any, watch: Function }, onchange: (v: string) => void }} p
 */
export function chipRow({ label, name, options, sig, onchange }) {
  const row = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label, dataset: { setting: name } });
  const draw = list => row.replaceChildren(...list.map(([v, text]) => {
    const b = h('button', { type: 'button', class: 'chip-btn', role: 'radio', 'aria-checked': String(String(sig.value) === v), dataset: { value: v } }, text);
    b.addEventListener('click', () => onchange(v));
    return b;
  }));
  draw(options);
  const off = sig.watch(v => { for (const b of row.querySelectorAll('[role="radio"]')) b.setAttribute('aria-checked', String(b.getAttribute('data-value') === String(v))); });
  return { el: row, redraw: draw, dispose: off };
}

/**
 * Гриф, который сам следует строю, ориентации и нотации. interactive + onTap — нажатие на место грифа (квизы).
 * @param {{ add: Function }} d @param {string} [label] @param {{ interactive?: boolean, onTap?: (string: number, fret: number) => void }} [o]
 */
export function neckView(d, label = 'Гриф', { interactive = false, onTap = null } = {}) {
  const s = settings.value;
  const fb = createFretboard({ tuning: TUNINGS[s.tuning].midi, from: 0, to: 12, orientation: /** @type {any} */ (s.orientation), german: s.notation === 'german', label, interactive, onTap });
  let last = null;
  const show = spec => {
    last = spec;
    const st = settings.value;
    fb.update({ markers: [], rulers: [], links: [], ...spec, tuning: TUNINGS[st.tuning].midi, orientation: /** @type {any} */ (st.orientation), german: st.notation === 'german' });
    if (spec.focus != null) requestAnimationFrame(() => fb.scrollTo(spec.focus));
  };
  d.add(settings.watch(() => { if (last) show(last); }));
  return { el: fb.el, show, cursor: fb.cursor, fb };
}

/** Круг, который следует нотации и терминам */
export function dialView(d, { label = 'Круг из 12 нот', onPick = null } = {}) {
  const dial = createDial({ label, onPick, german: german(), terms: settings.value.terms });
  d.add(settings.watch(s => dial.setOptions({ german: s.notation === 'german', terms: s.terms })));
  return dial;
}

/**
 * Кнопка «Послушать» ↔ «Стоп». build() возвращает, что играть: { items, title, bpm, loop, onStep }.
 * @param {{ add: Function }} d @param {{ label?: string, action?: string, build: () => any }} p
 */
export function listenButton(d, { label = 'Послушать', action = 'listen', build }) {
  let mine = false;
  const text = h('span', null, label);
  const ico = h('span', { class: 'ico-slot' }, icon('playFill', 20));
  const btn = h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action } }, ico, text);
  btn.addEventListener('click', async () => {
    if (mine && example.value) { stopExample(); return; }
    const p = build();
    mine = true;
    const ok = await playExample(p.items, { title: p.title, bpm: p.bpm, loop: p.loop, onStep: i => { p.onStep?.(i); if (i < 0) mine = false; } });
    if (!ok) { mine = false; text.textContent = 'Без звука'; }
  });
  d.add(example.watch(v => {
    const playing = !!v && mine;
    if (!v) mine = false;
    text.textContent = playing ? 'Стоп' : label;
    ico.replaceChildren(icon(playing ? 'stopFill' : 'playFill', 20));
  }));
  d.add(() => { if (mine) stopExample(); });
  return btn;
}

/**
 * Показ сцены урока: круг, гриф, фишки (ступени, лады), сетка аккордов (блюз), подпись.
 * step(i) подсвечивает i-й звук примера на круге и грифе.
 */
export function sceneView(d) {
  const dial = dialView(d, { label: 'Круг' });
  const neck = neckView(d, 'Гриф урока');
  const chips = h('div', { class: 'scene-chips' });
  const grid = h('div', { class: 'scene-grid', role: 'list', 'aria-label': 'Такты' });
  const caption = h('p', { class: 'muted note' });
  const dialWrap = h('div', { class: 'dial-wrap' }, dial.el);
  const neckWrap = card({ cls: 'neckcard' }, neck.el);
  const el = h('div', { class: 'scene' }, dialWrap, chips, grid, neckWrap, caption);
  let scene = null;
  return {
    el,
    /** @param {import('../core/lessons.js').Scene | null | undefined} sc */
    show(sc) {
      scene = sc || {};
      dialWrap.hidden = !scene.dial;
      if (scene.dial) dial.update(scene.dial);
      neckWrap.hidden = !scene.neck;
      if (scene.neck) neck.show({ ...scene.neck, focus: scene.neck.focus ?? scene.neck.from + 2 });
      chips.hidden = !scene.chips;
      chips.replaceChildren(...(scene.chips || []).map(c => h('span', { class: `scene-chip${c.on ? ' on' : ''}` }, h('b', null, c.label), c.sub ? h('small', null, c.sub) : null)));
      grid.hidden = !scene.grid;
      grid.replaceChildren(...(scene.grid || []).map((g, i) => h('span', { class: 'grid-cell', role: 'listitem', dataset: { i: String(i) } }, g)));
      caption.textContent = scene.caption || '';
      caption.hidden = !scene.caption;
    },
    /** Подсветить звучащий элемент примера (−1 — убрать) */
    step(i) {
      const it = i >= 0 && scene?.seq ? scene.seq[i] : null;
      neck.cursor(it ? it.notes.filter(n => n.string != null).map(n => ({ string: n.string, fret: n.fret })) : []);
      if (scene?.dial) dial.glow(it && it.dialPc != null ? it.dialPc : null);
      if (scene?.grid) for (const c of grid.children) c.classList.toggle('on', !!it && Number(/** @type {HTMLElement} */ (c).dataset.i) === i % 12 && i < 12);
    },
    get scene() { return scene; },
  };
}

/** Прогресс уроков: { done: { id: дата }, score: { id: верных ответов } } */
export const lessonProgress = () => store().get('lessons', { done: {}, score: {} });

/** Карточка «Уроки темы» со ссылками и отметками */
export function lessonsCard(topic) {
  const prog = lessonProgress();
  const list = lessonsOf(topic);
  return card({ title: 'Уроки темы', id: `lessons-${topic}`, cls: 'flush lessons' },
    h('p', { class: 'muted note pad' }, 'Урок — 5–10 минут: объяснение, пример на грифе, звук, «сыграй сам» с микрофоном и короткая проверка.'),
    h('div', { class: 'list' }, ...list.map(l => linkRow({
      href: `#/theory/lesson?id=${l.id}`, title: l.title, hint: `${l.minutes} мин · ${l.why}`,
      badge: prog.done?.[l.id] ? 'пройден' : null,
      lead: h('span', { class: `lesson-dot${prog.done?.[l.id] ? ' done' : ''}`, 'aria-hidden': 'true' }, prog.done?.[l.id] ? icon('check', 16) : null),
    }))));
}
