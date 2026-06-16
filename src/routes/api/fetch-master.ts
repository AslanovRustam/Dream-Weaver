// POST /api/fetch-master
// Fetches an image URL server-side and returns it as a base64 dataURL.
// Used by the resize batch runner when the master image is an FTP URL that
// can't be loaded client-side due to missing CORS headers.
import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "../../lib/auth-server";
import { safeFetchImage, UnsafeUrlError } from "../../lib/safe-fetch";
import { rateLimitResponse } from "../../lib/request-guard";

export const Route = createFileRoute("/api/fetch-master")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request);
        if (auth instanceof Response) return auth;

        const fmRl = rateLimitResponse("fetch-master", auth.id, 30, 60_000);
        if (fmRl) return fmRl;

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
          const { buffer, mime } = await safeFetchImage(url);
          const b64 = buffer.toString("base64");
          return Response.json({ dataUrl: `data:${mime};base64,${b64}` });
        } catch (e) {
          if (e instanceof UnsafeUrlError) {
            return Response.json({ error: "URL not allowed" }, { status: 400 });
          }
          // Don't leak the internal exception message to the client.
          console.warn("fetch-master upstream failed", e);
          return Response.json({ error: "fetch failed" }, { status: 502 });
        }
      },
    },
  },
});
