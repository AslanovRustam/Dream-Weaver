// Server-side background removal proxy.
//
// Forwards a generated character image to a local rembg HTTP server running a
// BiRefNet matting model (correctly handles see-through gaps between limbs and
// never colour-keys, so it can't hole the figure). Browser ONNX can't run
// BiRefNet here (WebGPU buffer limit / WASM OOM), so this runs it server-side.
//
// Start the rembg server once:
//   pip install "rembg[cli,cpu]"
//   rembg s --host 127.0.0.1 --port 7001 --no-ui
//
// Config (env): REMBG_URL (default http://127.0.0.1:7001),
//               REMBG_MODEL (default birefnet-general-lite).
export const runtime = "nodejs";

type Body = { image?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const image = (body.image || "").trim();
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return Response.json({ error: "Ожидается data:image;base64 в поле image" }, { status: 400 });
  const mime = m[1];
  const bytes = Buffer.from(m[2], "base64");

  const base = (process.env.REMBG_URL || "http://127.0.0.1:7001").replace(/\/$/, "");
  const model = process.env.REMBG_MODEL || "birefnet-general-lite";

  try {
    const form = new FormData();
    const ext = mime.split("/")[1] || "png";
    form.append("file", new Blob([bytes], { type: mime }), `input.${ext}`);
    // The rembg POST endpoint reads `model` from the FORM body (not the query
    // string). Passing it here selects BiRefNet; otherwise rembg uses its default
    // (bria-rmbg, which is non-commercial — must be avoided).
    form.append("model", model);

    const res = await fetch(`${base}/api/remove`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return Response.json({ error: "rembg вернул ошибку", detail }, { status: 502 });
    }
    const out = Buffer.from(await res.arrayBuffer());
    const imageUrl = `data:image/png;base64,${out.toString("base64")}`;
    return Response.json({ imageUrl });
  } catch (e) {
    return Response.json(
      { error: "rembg-сервис недоступен", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
