// Shared creative helpers for the interactive landing builders (fortune wheel,
// slot machine, …): AI-image prompts and client-side background removal.

/** Themed ENVIRONMENT/backdrop prompt — immersive scene with a clean centre for
 *  the interactive element and no characters. */
export function bgPreset(theme: string): string {
  return `${theme}. A wide vertical promotional landing BACKGROUND SCENE / environment in this theme, immersive, vibrant, rich depth and lighting, with a clean empty area in the centre for the game element. NO characters, NO people, NO central subject, NO UI.`;
}

/** Character prompt — a big head-to-thigh promo mascot crop on a plain,
 *  high-contrast backdrop so it cuts out cleanly. Style is fixed (3D Pixar);
 *  the subject/details come from the user's `prompt`. Pair with aspectRatio "3:4". */
export function characterPreset(prompt: string): string {
  return `Half-body 3D stylized character portrait: ${prompt}. MEDIUM SHOT — the character is BIG and fills most of the frame and is CROPPED ONLY by the BOTTOM edge at about mid-thigh (do NOT show the full body, do NOT show feet). CRITICAL FRAMING: the ENTIRE head with EVERYTHING on top of it — ears, hat, crown, hair, antennae — must be FULLY inside the frame with a clear empty margin ABOVE them; nothing on top of the head may touch or be cut by the top edge. Leave a small uniform margin of background on the left and right too. Facing the camera, confident expressive pose. Soft studio lighting, smooth shadows, high detail textures, Pixar-quality 3D render, ultra-clean composition, 8K resolution. CRITICAL — BACKGROUND: a PLAIN UNIFORM FLAT SINGLE SOLID COLOUR studio backdrop, and that colour MUST strongly CONTRAST with every colour on the character (pick a saturated backdrop hue far from any colour the character wears, e.g. a solid magenta/orange behind a blue-green character). The exact background colour must NOT appear anywhere on the character, its outfit or accessories, so the silhouette stays crisp and easy to cut out. No scenery, no props, no gradient, no shadows cast on the backdrop.`;
}

/**
 * Cut the background out of a generated character image.
 *
 * Primary path is the server route /api/remove-bg → a local rembg server running
 * a BiRefNet matting model. BiRefNet understands the SUBJECT (correctly detects
 * see-through gaps between limbs) and never colour-keys, so it can't hole the
 * figure — the failure mode of every colour/threshold approach. It runs
 * server-side because BiRefNet can't run in the browser here (WebGPU buffer
 * limit / WASM OOM). Falls back to the local colour-key flood if the service is
 * unavailable.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  try {
    const res = await fetch("/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (res.ok) {
      const data = (await res.json()) as { imageUrl?: string };
      if (data.imageUrl) return await hardenCutout(data.imageUrl);
    }
  } catch {
    /* service down — fall through */
  }
  return removeBackgroundColorKey(dataUrl);
}

/** Load an image element from a URL/data-URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Harden the soft neural alpha into a solid cut-out. @imgly returns a slightly
 * translucent alpha over the WHOLE subject (interior ~200-250, and thin parts
 * like ears drop to ~120-200 → they read as see-through). Remap so any clearly
 * foreground alpha becomes fully opaque, keeping a narrow feather only at the
 * true edge. Purely alpha-based — never touches colour, so it can't hole the
 * figure.
 */
async function hardenCutout(neuralUrl: string): Promise<string> {
  try {
    const cut = await loadImage(neuralUrl);
    const w = cut.naturalWidth;
    const h = cut.naturalHeight;
    if (!w || !h) return neuralUrl;
    const cc = document.createElement("canvas");
    cc.width = w;
    cc.height = h;
    const cctx = cc.getContext("2d");
    if (!cctx) return neuralUrl;
    cctx.drawImage(cut, 0, 0);
    const c = cctx.getImageData(0, 0, w, h);
    const cd = c.data;
    const N = w * h;
    const LO = 20;
    const HI = 110;
    for (let p = 0; p < N; p++) {
      const ai = p * 4 + 3;
      const a = cd[ai];
      if (a === 0 || a === 255) continue;
      cd[ai] = a >= HI ? 255 : a <= LO ? 0 : Math.round(((a - LO) / (HI - LO)) * 255);
    }
    cctx.putImageData(c, 0, 0);
    return cc.toDataURL("image/png");
  } catch {
    return neuralUrl;
  }
}

/**
 * Fallback: cut a plain studio backdrop by colour-key flood-fill from the
 * borders (a pixel joins the background when it is within THR of the backdrop
 * colour). The flood STOPS at any pixel farther than THR, so it can't leak
 * across the anti-aliased edge into the character interior. Used only when the
 * neural model above is unavailable.
 */
function removeBackgroundColorKey(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0);
      let imgData: ImageData;
      try {
        imgData = ctx.getImageData(0, 0, w, h);
      } catch {
        return resolve(dataUrl);
      }
      const d = imgData.data;
      const N = w * h;

      // Backdrop colour = average of ALL border pixels (robust to a noisy corner).
      let br = 0,
        bg = 0,
        bb = 0,
        cnt = 0;
      const addBorder = (p: number) => {
        const i = p * 4;
        br += d[i];
        bg += d[i + 1];
        bb += d[i + 2];
        cnt++;
      };
      for (let x = 0; x < w; x++) {
        addBorder(x);
        addBorder((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        addBorder(y * w);
        addBorder(y * w + (w - 1));
      }
      br /= cnt;
      bg /= cnt;
      bb /= cnt;

      const THR = 64 * 64 * 3; // per-channel ~64 — kills vignette halo, keeps a contrasting character
      const dist2 = (i: number) => {
        const dr = d[i] - br,
          dg = d[i + 1] - bg,
          db = d[i + 2] - bb;
        return dr * dr + dg * dg + db * db;
      };

      // Border flood-fill: remove connected background within THR.
      const visited = new Uint8Array(N);
      const stack: number[] = [];
      const seed = (p: number) => {
        if (!visited[p]) stack.push(p);
      };
      for (let x = 0; x < w; x++) {
        seed(x);
        seed((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        seed(y * w);
        seed(y * w + (w - 1));
      }
      while (stack.length) {
        const p = stack.pop() as number;
        if (visited[p]) continue;
        visited[p] = 1;
        const i = p * 4;
        if (dist2(i) > THR) continue; // not background — stop (cannot leak inside)
        d[i + 3] = 0;
        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) seed(p - 1);
        if (x < w - 1) seed(p + 1);
        if (y > 0) seed(p - w);
        if (y < h - 1) seed(p + w);
      }

      // Enclosed pockets (arm↔torso gaps) the border flood can't reach.
      for (let p = 0; p < N; p++) {
        const i = p * 4;
        if (d[i + 3] !== 0 && dist2(i) <= THR) d[i + 3] = 0;
      }

      // 1px edge erosion: shave the thin anti-aliased rim so no faint outline of
      // old background colour remains around the silhouette.
      const toClear: number[] = [];
      for (let p = 0; p < N; p++) {
        if (d[p * 4 + 3] === 0) continue;
        const x = p % w;
        const y = (p - x) / w;
        if (
          (x > 0 && d[(p - 1) * 4 + 3] === 0) ||
          (x < w - 1 && d[(p + 1) * 4 + 3] === 0) ||
          (y > 0 && d[(p - w) * 4 + 3] === 0) ||
          (y < h - 1 && d[(p + w) * 4 + 3] === 0)
        ) {
          toClear.push(p * 4 + 3);
        }
      }
      for (const a of toClear) d[a] = 0;

      ctx.putImageData(imgData, 0, 0);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
