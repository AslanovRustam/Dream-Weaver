// POST /api/history/bulk-zip
// Body: { card_ids: string[] }
//
// Streams a single ZIP containing the master + every resize for each of
// the requested cards. Layout inside the ZIP:
//
//   {card.name sanitized}_{cardIdShort}/
//     master_{w}x{h}.png
//     resize_{w}x{h}.png
//     resize_{w}x{h}_2.png   (if dup size present)
//
// Concurrency: fetches up to 5 files in parallel. Cap of 20 cards per
// request (BULK_CARD_LIMIT). Files are pulled by their public HTTPS URL
// (not via FTP), so the FTP server doesn't see this traffic.
import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";

import { authErrorResponse, getUserClient, requireUser } from "../../../lib/auth-server";
import { BULK_CARD_LIMIT, getHistoryCard } from "../../../lib/history/queries";
import { rateLimitResponse } from "../../../lib/request-guard";

type Body = { card_ids?: string[] };

const PARALLEL_FETCHES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file safety net

function sanitizeFolderName(raw: string): string {
  return (
    raw
      .replace(/[^\p{L}\p{N}_\- .]/gu, "_")
      .replace(/\s+/g, "_")
      .slice(0, 60)
      .replace(/^_+|_+$/g, "") || "card"
  );
}

interface FileEntry {
  /** path inside the zip */
  path: string;
  url: string;
}

/**
 * Build the list of files we want in the archive from the card detail.
 * Handles duplicate-size resizes by appending _2, _3, ... like the
 * spec calls out.
 *
 * Extension is derived from the actual upload (some tiles are JPEG,
 * masters are PNG) by parsing the URL's filename — we used to hardcode
 * .png, which meant downloaded files had the wrong extension.
 */
function planCardFiles(card: {
  id: string;
  name: string;
  master: unknown;
  resizes: unknown[];
}): FileEntry[] {
  const folder = `${sanitizeFolderName(card.name)}_${card.id.slice(0, 8)}`;
  const out: FileEntry[] = [];

  const master = card.master as {
    image_url: string | null;
    width: number | null;
    height: number | null;
  } | null;
  if (master?.image_url) {
    const w = master.width ?? "?";
    const h = master.height ?? "?";
    const ext = extFromUrl(master.image_url, "png");
    out.push({ path: `${folder}/master_${w}x${h}.${ext}`, url: master.image_url });
  }

  const sizeCounter = new Map<string, number>();
  for (const r of card.resizes as Array<{
    image_url: string | null;
    width: number | null;
    height: number | null;
  }>) {
    if (!r.image_url) continue;
    const w = r.width ?? "?";
    const h = r.height ?? "?";
    const key = `${w}x${h}`;
    const n = (sizeCounter.get(key) ?? 0) + 1;
    sizeCounter.set(key, n);
    const suffix = n === 1 ? "" : `_${n}`;
    const ext = extFromUrl(r.image_url, "jpg");
    out.push({
      path: `${folder}/resize_${key}${suffix}.${ext}`,
      url: r.image_url,
    });
  }
  return out;
}

/**
 * Pull the file extension off the FTP URL (e.g. ".../foo.jpg" → "jpg").
 * Falls back to `fallback` for unknown or absent extensions.
 */
function extFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    if (dot > slash && dot < path.length - 1) {
      const ext = path.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
    }
  } catch {
    /* malformed URL — fall through */
  }
  return fallback;
}

/**
 * Drain `entries` through `worker` with at most `n` in flight at once.
 * Errors are caught per-entry and recorded so a single bad URL doesn't
 * kill the whole archive.
 */
async function runWithConcurrency<T>(
  entries: T[],
  n: number,
  worker: (e: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const pool: Promise<void>[] = [];
  const runNext = async (): Promise<void> => {
    while (i < entries.length) {
      const idx = i++;
      try {
        await worker(entries[idx]);
      } catch (err) {
        console.error("bulk-zip entry failed", err);
      }
    }
  };
  for (let k = 0; k < Math.min(n, entries.length); k++) {
    pool.push(runNext());
  }
  await Promise.all(pool);
}

export const Route = createFileRoute("/api/history/bulk-zip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);

          const bzRl = rateLimitResponse("bulk-zip", user.id, 6, 60_000);
          if (bzRl) return bzRl;

          let body: Body;
          try {
            body = (await request.json()) as Body;
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const ids = (body.card_ids ?? [])
            .filter((x): x is string => typeof x === "string" && !!x.trim())
            .map((x) => x.trim());
          if (ids.length === 0) {
            return Response.json({ error: "card_ids required" }, { status: 400 });
          }
          if (ids.length > BULK_CARD_LIMIT) {
            return Response.json(
              { error: `Maximum ${BULK_CARD_LIMIT} cards per bulk request` },
              { status: 400 },
            );
          }

          const supa = getUserClient(user.accessToken);

          // Resolve every card and build the file plan up-front so we
          // can fail fast if the user isn't allowed to see any of them.
          const allFiles: FileEntry[] = [];
          for (const id of ids) {
            const detail = await getHistoryCard(supa, id, user.id);
            if (!detail) continue;
            allFiles.push(
              ...planCardFiles({
                id: detail.id,
                name: detail.name,
                master: detail.master,
                resizes: detail.resizes,
              }),
            );
          }
          if (allFiles.length === 0) {
            return Response.json({ error: "No accessible files" }, { status: 404 });
          }

          const zip = new JSZip();
          const skipped: string[] = [];

          await runWithConcurrency(allFiles, PARALLEL_FETCHES, async (entry) => {
            const res = await fetch(entry.url);
            if (!res.ok) {
              skipped.push(entry.path);
              return;
            }
            const buf = await res.arrayBuffer();
            if (buf.byteLength > MAX_FILE_BYTES) {
              skipped.push(entry.path);
              return;
            }
            zip.file(entry.path, buf);
          });

          if (skipped.length > 0) {
            zip.file(
              "_missing.txt",
              `Не удалось включить следующие файлы:\n${skipped.join("\n")}\n` +
                `\nВозможные причины: файл ещё не загружен на хранилище, истёк срок хранения, временная ошибка сети.`,
            );
          }

          // Generate the archive as a single in-memory blob.
          //
          // We used to stream via generateNodeStream() but the Web
          // Response constructor in this runtime (undici) doesn't accept
          // a Node Readable directly — the `as any` cast silently
          // produced a near-empty body, so users were downloading 1 KB
          // junk files. Wrapping the bytes in a Blob is the simplest
          // path that the Web Response accepts everywhere. Total size
          // is bounded by BULK_CARD_LIMIT × MAX_FILE_BYTES.
          const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
            mimeType: "application/zip",
          });

          const stamp = new Date().toISOString().slice(0, 10);
          return new Response(zipBlob, {
            status: 200,
            headers: {
              "Content-Type": "application/zip",
              "Content-Length": String(zipBlob.size),
              "Content-Disposition": `attachment; filename="dream-weaver_${stamp}.zip"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          return authErrorResponse(err);
        }
      },
    },
  },
});
