// POST /api/fetch-master
// Fetches an image URL server-side and returns it as a base64 dataURL.
// Used by the resize batch runner when the master image is an FTP URL that
// can't be loaded client-side due to missing CORS headers.
import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "../../lib/auth-server";

export const Route = createFileRoute("/api/fetch-master")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request);
        if (auth instanceof Response) return auth;

        let url: string;
        try {
          const body = (await request.json()) as { url?: unknown };
          url = typeof body.url === "string" ? body.url.trim() : "";
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return Response.json({ error: "URL must be http(s)" }, { status: 400 });
        }

        try {
          const res = await fetch(url);
          if (!res.ok) {
            return Response.json({ error: `Upstream ${res.status}` }, { status: 502 });
          }
          const contentType = res.headers.get("content-type") ?? "image/jpeg";
          const mime = contentType.split(";")[0].trim();
          const buf = await res.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          return Response.json({ dataUrl: `data:${mime};base64,${b64}` });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "fetch failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
