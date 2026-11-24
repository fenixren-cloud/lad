// contrast.js — контраст цветов по WCAG 2: относительная яркость и отношение контраста. Чистая логика.

/** '#f5a524' или '#fff' → [r, g, b] 0..255 */
export function parseHex(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Не цвет: ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}

/** Относительная яркость 0..1 */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Отношение контраста 1..21: текст — от 4,5 (AA), крупный текст и значки — от 3 */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
