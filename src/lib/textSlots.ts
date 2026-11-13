// Места надписей мастера: где мастер и его чистая копия (без текста) расходятся — там
// стоял текст. Чистая функция (без DOM): пиксели считает textSlots в bannerLayersRun.
import type { TextSlots } from "./bannerLayers";

/** RGBA двух картинок N×N → места надписей (заголовок, оффер, кнопка). */
export function slotsFromPixels(a: ArrayLike<number>, b: ArrayLike<number>, N: number): TextSlots | null {
  {
    const on = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const d = Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
      on[i] = d > 120 ? 1 : 0;
    }
    // Связываем буквы в строки: расширение по горизонтали на 3, по вертикали на 1.
    const grown = new Uint8Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (on[y * N + x])
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy >= 0 && yy < N && xx >= 0 && xx < N) grown[yy * N + xx] = 1;
            }
    const seen = new Uint8Array(N * N);
    const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
    for (let s = 0; s < N * N; s++) {
      if (!grown[s] || seen[s]) continue;
      const st = [s];
      seen[s] = 1;
      const bx = { x0: N, y0: N, x1: 0, y1: 0, n: 0 };
      while (st.length) {
        const p = st.pop()!;
        const x = p % N, y = (p / N) | 0;
        bx.n++;
        bx.x0 = Math.min(bx.x0, x); bx.x1 = Math.max(bx.x1, x);
        bx.y0 = Math.min(bx.y0, y); bx.y1 = Math.max(bx.y1, y);
        for (const q of [p - 1, p + 1, p - N, p + N])
          if (q >= 0 && q < N * N && !seen[q] && grown[q] && Math.abs((q % N) - x) <= 1) {
            seen[q] = 1;
            st.push(q);
          }
      }
      if (bx.n >= N * N * 0.006) boxes.push(bx);
    }
    if (!boxes.length) return null;
    const to01 = (b: (typeof boxes)[number]) => ({ x: b.x0 / N, y: b.y0 / N, w: (b.x1 - b.x0 + 1) / N, h: (b.y1 - b.y0 + 1) / N });
    // Склеиваем строки одного блока (соседние по вертикали и перекрытые по горизонтали).
    boxes.sort((p, q) => p.y0 - q.y0);
    const merged: typeof boxes = [];
    for (const b of boxes) {
      const last = merged[merged.length - 1];
      const overlapX = last && Math.min(last.x1, b.x1) - Math.max(last.x0, b.x0) > 0.4 * Math.min(last.x1 - last.x0, b.x1 - b.x0);
      if (last && overlapX && b.y0 - last.y1 <= 3) {
        last.x0 = Math.min(last.x0, b.x0); last.x1 = Math.max(last.x1, b.x1);
        last.y1 = Math.max(last.y1, b.y1); last.n += b.n;
      } else merged.push({ ...b });
    }
    const big = merged.filter((b) => (b.x1 - b.x0) >= N * 0.18);
    // Кнопка — самый нижний вытянутый блок в нижней части (со свечением он бывает до 30% высоты).
    const btn = [...big].reverse().find((b) => b.y0 > N * 0.55 && (b.x1 - b.x0) / Math.max(1, b.y1 - b.y0 + 1) >= 2.2 && b.y1 - b.y0 < N * 0.3);
    // Остальные блоки — от крупного к мелкому; кому какой — решает раскладка по текстам
    // (оффер с числом — в самый крупный, без оффера туда идёт заголовок).
    const blocks = big.filter((b) => b !== btn).sort((p, q) => q.n - p.n).map(to01);
    if (!blocks.length && !btn) return null;
    return { blocks, btn: btn ? to01(btn) : undefined };
  }
}

