// signal.js — маленькое реактивное значение: экран подписывается и обновляет только то, что изменилось,
// а не перерисовывает панель целиком (иначе элемент под пальцем исчезает — так было в «Гитарном круге»).

/**
 * @template T
 * @param {T} initial
 */
export function signal(initial) {
  let value = initial;
  /** @type {Set<(v: T) => void>} */
  const subs = new Set();
  return {
    get value() { return value; },
    set value(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of [...subs]) fn(value);
    },
    /** @param {(v: T) => T} fn */
    update(fn) { this.value = fn(value); },
    /**
     * Подписка; сразу вызывается с текущим значением. Возвращает отписку.
     * @param {(v: T) => void} fn
     */
    watch(fn) {
      subs.add(fn);
      fn(value);
      return () => { subs.delete(fn); };
    },
    get subscribers() { return subs.size; },
  };
}

/**
 * Значение, вычисляемое из других сигналов.
 * @template R
 * @param {{ value: any, watch: (fn: (v: any) => void) => () => void }[]} deps
 * @param {() => R} fn
 */
export function computed(deps, fn) {
  const out = signal(fn());
  for (const d of deps) d.watch(() => { out.value = fn(); });
  return { get value() { return out.value; }, watch: out.watch.bind(out) };
}

/** Набор отписок экрана: всё снимается разом, когда экран закрывается */
export function disposer() {
  /** @type {(() => void)[]} */
  const list = [];
  return {
    /** @param {() => void} fn */
    add(fn) { list.push(fn); return fn; },
    dispose() { while (list.length) { try { /** @type {() => void} */ (list.pop())(); } catch (e) { console.error(e); } } },
    get size() { return list.length; },
  };
}
