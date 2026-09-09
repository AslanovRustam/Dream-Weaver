// Global generation context — survives route navigation.
//
// Why it exists: the generation UI used to live inside ImageGenApp's
// local React state. The moment the user navigated to /history or
// /admin, the component unmounted and the resize batch silently lost
// its tile-grid and progress display. Backend work continued (fire-and-
// forget POSTs and FTP uploads), but the front-end "forgot" everything.
//
// This context lifts the relevant state — master image, last payload,
// resize tiles, status — to the root level. AppHeader can show a
// progress indicator from anywhere; ImageGenApp simply renders what the
// context already holds. Navigating away no longer drops anything.
//
// Persistence: when the active card changes or tiles update, we mirror
// a minimal snapshot to localStorage. A hard reload of the tab restores
// the most recent master and tile grid (history endpoint hydrates the
// authoritative state on demand).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, apiJson } from "./api-client";
import { formatGenerationError } from "./generation-errors";
import {
  centerCropToExact,
  extractMasterDetails,
  generateImage,
  resizeContain,
  type GeneratePayload,
  type MasterDetails,
  type UsageInfo,
} from "./imageGen";
import { planResizes, type SourcePlan } from "./resizePlan";
import type { SelectedSize } from "@/components/resize/ResizeBatchPanel";

export type GenerationStatus = "idle" | "master_running" | "batch_running" | "done" | "error";

export type BatchTile = {
  id: string; // unique key: `${w}x${h}`
  size: SelectedSize;
  status: "queued" | "running" | "done" | "error";
  /** Tells the UI whether this tile is "free" (pure client-side scale
   *  of the existing master) or "paid" (came out of an i2i bucket
   *  generation shared with siblings of the same aspect). The flag is
   *  set at batch start based on the tile's aspect vs the master's. */
  kind: "scale_from_master" | "scale_from_bucket";
  /** Final image data URL, scaled to exact w×h. */
  dataUrl?: string;
  error?: string;
};

interface GenerationStateSnapshot {
  status: GenerationStatus;
  imageUrl: string | null;
  lastUsage: UsageInfo | null;
  lastPayload: GeneratePayload | null;
  lastMasterRatio: string;
  tiles: BatchTile[];
  errorMsg: string;
  /** Generation card id assigned by the server. */
  cardId: string | null;
}

interface GenerationContextValue extends GenerationStateSnapshot {
  /** Counts that drive the header indicator. */
  totalTiles: number;
  doneTiles: number;
  runningTiles: number;
  /** True when ANY background work is in flight. */
  isBusy: boolean;
  /** Run a master generation with full payload. Returns the generated
   *  image dataURL on success (or null on failure / cancellation) so
   *  the caller can immediately use it without waiting for a re-render
   *  to read it from context state. */
  runMaster: (payload: GeneratePayload) => Promise<string | null>;
  /** Start a resize batch — same args we used to feed useResizeBatch. */
  runBatch: (args: {
    sizes: SelectedSize[];
    master: string;
    masterRatio: string;
    basePayload: GeneratePayload;
    /** True for a "retry failed" re-run: reuse an aspect+detail bucket's
     *  already-generated source (from an earlier call this session) instead of
     *  minting a new, visually inconsistent one. False/omitted (a fresh
     *  "Сгенерировать" / "Сгенерировать заново") always generates anew. */
    reuseCache?: boolean;
  }) => Promise<void>;
  /** Abort everything pending. In-flight provider calls return naturally. */
  cancel: () => void;
  /** Re-run generation for ONE tile in place. Does NOT flip global status to
   *  batch_running, so the result list stays visible and the other tiles are
   *  untouched — only this tile shows a local "running" spinner. */
  regenerateTile: (id: string) => Promise<void>;
  /** Drop a single tile from the current batch (user deleted that format).
   *  A later "Download ZIP" naturally excludes it. */
  removeTile: (id: string) => void;
  /** Wipe master + tiles. Used when starting fresh from a different brief. */
  clear: () => void;
  /** Imperatively patch payload (e.g. when loaded from history). Pass `tiles`
   *  to rehydrate the resize grid from a saved card — the history restore flow
   *  supplies the previously-generated resizes here so opening a project pulls
   *  the master AND its resizes (omit → the grid resets to empty as before). */
  setMasterImage: (args: {
    image: string;
    payload: GeneratePayload;
    ratio: string;
    cardId: string | null;
    usage?: UsageInfo | null;
    tiles?: BatchTile[];
  }) => void;
  /** Hard-set a single field that ImageGenApp owns externally (history flow). */
  setLastPayload: (
    updater: GeneratePayload | null | ((prev: GeneratePayload | null) => GeneratePayload | null),
  ) => void;
}

const STORAGE_KEY = "dw_generation_state_v1";

const INITIAL: GenerationStateSnapshot = {
  status: "idle",
  imageUrl: null,
  lastUsage: null,
  lastPayload: null,
  lastMasterRatio: "1:1",
  tiles: [],
  errorMsg: "",
  cardId: null,
};

const Ctx = createContext<GenerationContextValue | null>(null);

export function useGeneration(): GenerationContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGeneration must be used inside <GenerationProvider>");
  return v;
}

interface ProviderProps {
  children: ReactNode;
}

/**
 * Strip oversized fields from the snapshot before localStorage save.
 *
 * Master imageUrl is KEPT regardless of whether it's a dataURL or an
 * FTP URL — losing it means a refresh wipes the user's master from
 * the canvas, which was the whole reason we added persistence. One
 * master ≈ 1–2 MB base64; fits comfortably in the 5 MB quota. If we
 * ever exceed it, saveToStorage's try/catch will swallow the failure.
 *
 * What we still drop:
 *   • lastPayload's ref dataURLs (brand_logo, side_a_logo, ...) — they
 *     can be huge stacked, and the form re-attaches them on the next
 *     generation if the user still wants them.
 *   • Tile dataURLs — already on FTP / in history.
 */
function sanitizeForStorage(s: GenerationStateSnapshot): GenerationStateSnapshot {
  const stripPayload = (p: GeneratePayload | null): GeneratePayload | null => {
    if (!p) return null;
    const copy: GeneratePayload = { ...p };
    // Drop all base64 dataURL fields so the snapshot stays small.
    const dataUrlKeys: Array<keyof GeneratePayload> = [
      "brand_logo",
      "slot_screenshot",
      "slot_logo",
      "side_a_logo",
      "side_b_logo",
      "source_image",
    ];
    for (const k of dataUrlKeys) {
      const value = copy[k];
      if (typeof value === "string" && value.startsWith("data:")) {
        (copy as Record<string, unknown>)[k] = undefined;
      }
    }
    return copy;
  };
  return {
    ...s,
    // imageUrl preserved as-is (dataURL or FTP URL — see header comment).
    imageUrl: s.imageUrl,
    lastPayload: stripPayload(s.lastPayload),
    // Tiles: strip dataUrl, keep status + size so UI can show "done" badges
    // and the user can click through to /history to see them in full.
    tiles: s.tiles.map((t) => ({ ...t, dataUrl: undefined })),
  };
}

function loadFromStorage(): GenerationStateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GenerationStateSnapshot> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const merged = { ...INITIAL, ...parsed };
    // A persisted in-flight status can't have a live request behind it after a
    // reload (the fetch died with the old page). Coerce it to a terminal state
    // so the app never rehydrates into a stuck loader with no way out — this is
    // especially bad on mobile, where cancel/back are hidden during generation.
    if (merged.status === "master_running" || merged.status === "batch_running") {
      merged.status = "idle";
      merged.tiles = [];
    }
    return merged;
  } catch {
    return null;
  }
}

function saveToStorage(s: GenerationStateSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(s)));
  } catch {
    // Quota exceeded — drop the persistence rather than crash the page.
  }
}

async function persistResizeTile(
  cardId: string | undefined,
  size: SelectedSize,
  dataUrl: string,
): Promise<void> {
  if (!cardId) return;
  if (!dataUrl || dataUrl.length < 200 || !dataUrl.includes(",")) {
    console.warn("persistResizeTile: skipping empty dataUrl for", size);
    return;
  }
  try {
    await apiFetch(`/api/history/${cardId}/resize-tile`, {
      method: "POST",
      json: {
        image: dataUrl,
        width: size.w,
        height: size.h,
        aspect_ratio: size.ratio,
        group_id: size.group_id,
      },
    });
  } catch (e) {
    console.warn("persistResizeTile failed", e);
  }
}

export function GenerationProvider({ children }: ProviderProps) {
  const [state, setState] = useState<GenerationStateSnapshot>(() => loadFromStorage() ?? INITIAL);
  const cancelRef = useRef(false);
  // Live mirror of state so regenerateTile can read the current master/payload
  // without being re-created (and re-memoised) on every state change.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Cache of already-generated resize SOURCES (the uncropped flare canvas),
  // keyed by `${masterEpoch}|${ratio}|${detail}`. Every size sharing an
  // aspect+detail bucket must look like the SAME banner (just scaled) — a
  // bulk "Повторить упавшие" retry re-plans ONLY the failed sizes in its own
  // runBatch call, so without this cache it would mint a brand-new,
  // uncorrelated source for a bucket whose sibling tiles already succeeded in
  // the original run. masterEpoch bumps (invalidating the cache) whenever a
  // genuinely new master image becomes active.
  const masterEpochRef = useRef(0);
  const sourceCacheRef = useRef<Map<string, string>>(new Map());

  // Persist any changes so a hard reload restores recent state.
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const patch = useCallback(
    (
      p:
        | Partial<GenerationStateSnapshot>
        | ((s: GenerationStateSnapshot) => Partial<GenerationStateSnapshot>),
    ) => {
      setState((prev) => {
        const next = typeof p === "function" ? p(prev) : p;
        return { ...prev, ...next };
      });
    },
    [],
  );

  const updateTile = useCallback((id: string, tilePatch: Partial<BatchTile>) => {
    setState((prev) => ({
      ...prev,
      tiles: prev.tiles.map((t) => (t.id === id ? { ...t, ...tilePatch } : t)),
    }));
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setState((prev) => ({
      ...prev,
      status:
        prev.status === "batch_running"
          ? "done"
          : prev.status === "master_running"
            ? "idle"
            : prev.status,
      tiles: prev.tiles.map((t) =>
        t.status === "queued" || t.status === "running"
          ? { ...t, status: "error", error: "Отменено" }
          : t,
      ),
    }));
  }, []);

  const clear = useCallback(() => {
    // Don't blow up an in-flight batch if the user accidentally taps
    // the hide-indicator ✕ while it's still running. Cancel separately
    // via cancel() — clear() should only wipe a finished session.
    setState((prev) => {
      if (prev.status === "master_running" || prev.status === "batch_running") {
        return prev;
      }
      cancelRef.current = true;
      return { ...INITIAL };
    });
  }, []);

  const setMasterImage = useCallback<GenerationContextValue["setMasterImage"]>(
    ({ image, payload, ratio, cardId, usage, tiles }) => {
      masterEpochRef.current += 1;
      sourceCacheRef.current.clear();
      patch({
        status: "done",
        imageUrl: image,
        lastPayload: payload,
        lastMasterRatio: ratio,
        cardId,
        lastUsage: usage ?? null,
        errorMsg: "",
        // History restore passes the saved resizes here; a fresh master omits
        // it and the grid clears (previous behaviour).
        tiles: tiles ?? [],
      });
    },
    [patch],
  );

  const setLastPayload = useCallback<GenerationContextValue["setLastPayload"]>((updater) => {
    setState((prev) => ({
      ...prev,
      lastPayload: typeof updater === "function" ? updater(prev.lastPayload) : updater,
    }));
  }, []);

  const runMaster = useCallback<GenerationContextValue["runMaster"]>(
    async (payload) => {
      cancelRef.current = false;
      patch({
        status: "master_running",
        imageUrl: null,
        errorMsg: "",
        tiles: [],
        cardId: null,
        lastPayload: null,
      });
      try {
        const result = await generateImage(payload);
        if (cancelRef.current) return null;
        masterEpochRef.current += 1;
        sourceCacheRef.current.clear();
        patch({
          status: "done",
          imageUrl: result.image,
          lastUsage: result.usage,
          lastPayload: { ...payload, card_id: result.card_id ?? undefined },
          lastMasterRatio: payload.aspect_ratio,
          cardId: result.card_id ?? null,
        });
        return result.image;
      } catch (e) {
        patch({
          status: "error",
          errorMsg: formatGenerationError(e instanceof Error ? e.message : "Unknown error"),
        });
        return null;
      }
    },
    [patch],
  );

  const runBatch = useCallback<GenerationContextValue["runBatch"]>(
    async ({ sizes, master, masterRatio, basePayload, reuseCache }) => {
      if (sizes.length === 0 || !master) return;
      cancelRef.current = false;
      const epoch = masterEpochRef.current;
      const cacheKeyFor = (ratio: string, detail: string) => `${epoch}|${ratio}|${detail}`;

      // If master is an FTP/HTTP URL (history-loaded), resolve it to a
      // dataURL server-side before doing any canvas operations. The FTP
      // server doesn't send CORS headers so browser canvas would taint
      // and fail on client-side Image() loads.
      let masterDataUrl = master;
      if (master.startsWith("http://") || master.startsWith("https://")) {
        try {
          const r = await apiJson<{ dataUrl: string }>("/api/fetch-master", {
            method: "POST",
            body: JSON.stringify({ url: master }),
          });
          masterDataUrl = r.dataUrl;
        } catch (e) {
          console.warn("[runBatch] Could not resolve master URL to dataURL:", e);
          // Keep master as-is; same-aspect scale may still fail due to CORS,
          // but i2i path handles it server-side anyway.
        }
      }

      // Plan the batch: group every requested size by the canonical source
      // aspect flare can actually render (≤3:1), and size each source so a
      // pure client crop covers every member (resizePlan.ts).
      const sizeByKey = new Map(sizes.map((s) => [`${s.w}x${s.h}`, s]));
      const plans = planResizes(sizes.map((s) => ({ w: s.w, h: s.h })));
      const planByKey = new Map<string, SourcePlan>();
      for (const p of plans) for (const t of p.targets) planByKey.set(`${t.w}x${t.h}`, p);

      const initial: BatchTile[] = sizes.map((s) => {
        const plan = planByKey.get(`${s.w}x${s.h}`);
        // "Free" only when the source IS the (square) master itself: aspect 1:1
        // AND full detail. Micro tiles (even 1:1) need their own simplified
        // source, so they are never free.
        const free = plan?.ratio === masterRatio && plan?.detail === "full";
        return {
          id: `${s.w}x${s.h}`,
          size: s,
          status: "queued",
          kind: free ? "scale_from_master" : "scale_from_bucket",
        };
      });
      patch({ status: "batch_running", tiles: initial, errorMsg: "" });

      // Retry wrapper for the client center-crop. Browser canvas can fail
      // transiently under memory pressure; retry, then fall back to the source.
      const cropWithRetry = async (
        src: string,
        w: number,
        h: number,
        fallback: string,
      ): Promise<string> => {
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            return await centerCropToExact(src, w, h, "image/jpeg", 0.92);
          } catch (e) {
            console.warn(`[runBatch] centerCropToExact failed (attempt ${attempt + 1}/${maxAttempts})`, {
              w,
              h,
              error: e,
            });
            if (attempt < maxAttempts - 1) {
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            }
          }
        }
        console.error("[runBatch] centerCropToExact permanently failed, using fallback", { w, h });
        return fallback;
      };

      // Vision pre-pass only if some FULL-detail source must be regenerated
      // (not the master). Micro sources are deliberately stripped down and
      // don't reproduce the master's text, so they don't need it.
      const needsVision = plans.some((p) => p.detail === "full" && p.ratio !== masterRatio);
      let masterDetails: MasterDetails | null = null;
      if (needsVision) {
        try {
          masterDetails = await extractMasterDetails(masterDataUrl);
        } catch {
          masterDetails = null;
        }
      }

      const isTransient = (e: unknown) => {
        const msg = e instanceof Error ? e.message : "";
        return (
          msg.includes("оборвалось") ||
          msg.includes("пустой ответ") ||
          msg.includes("Таймаут") ||
          msg.includes("empty model response") ||
          msg.includes("No image payload")
        );
      };
      const isContentFilter = (e: unknown) =>
        e instanceof Error && e.message.startsWith("[content_filter]");

      for (const plan of plans) {
        if (cancelRef.current) break;
        const planSizes = plan.targets.map((t) => sizeByKey.get(`${t.w}x${t.h}`)!);
        for (const s of planSizes) updateTile(`${s.w}x${s.h}`, { status: "running" });

        // Resolve the SOURCE image for this plan.
        const isMicro = plan.detail !== "full";
        const cacheKey = cacheKeyFor(plan.ratio, plan.detail);
        let sourceUrl: string;
        const cached = reuseCache ? sourceCacheRef.current.get(cacheKey) : undefined;
        if (plan.ratio === masterRatio && !isMicro) {
          sourceUrl = masterDataUrl; // free — crop straight from the master
        } else if (cached) {
          // Retry mode: a sibling in this exact bucket already succeeded this
          // session — reuse its source so the retried tile matches it instead
          // of getting an uncorrelated fresh composition.
          sourceUrl = cached;
        } else {
          const rep = planSizes[0];
          const i2iPayload: GeneratePayload = {
            ...basePayload,
            aspect_ratio: plan.ratio,
            source_image: masterDataUrl,
            target_w: plan.source.w,
            target_h: plan.source.h,
            // Micro sources use a stripped composition (see GROUP_TEMPLATES
            // micro-*) and skip the master's detailed text facts.
            master_details: isMicro ? undefined : masterDetails ?? undefined,
            group_id: isMicro ? plan.detail : rep.group_id,
            skip_history_attach: true,
          };
          // t2i fallback: same prompt + aspect, no source image (used when i2i
          // trips content_filter — the master's prompt already passed safety).
          const t2iPayload: GeneratePayload = {
            ...i2iPayload,
            source_image: undefined,
            master_details: undefined,
          };
          const callWithRetry = async (
            attemptsLeft = 3,
          ): Promise<Awaited<ReturnType<typeof generateImage>>> => {
            try {
              return await generateImage(i2iPayload);
            } catch (e) {
              if (attemptsLeft > 1 && isTransient(e)) {
                console.warn("[runBatch] i2i transient error, retrying", e);
                await new Promise((r) => setTimeout(r, 1500));
                return callWithRetry(attemptsLeft - 1);
              }
              throw e;
            }
          };
          try {
            let src: Awaited<ReturnType<typeof generateImage>>;
            try {
              src = await callWithRetry();
            } catch (e) {
              if (isContentFilter(e)) {
                console.warn("[runBatch] i2i content_filter → retrying as t2i", { ratio: plan.ratio });
                src = await generateImage(t2iPayload);
              } else {
                throw e;
              }
            }
            sourceUrl = src.image;
            sourceCacheRef.current.set(cacheKey, sourceUrl);
          } catch (e) {
            // Source generation failed — mark every member of this plan as an
            // error (never pass off a wrong image as a real result).
            console.error("[runBatch] source generation failed", { ratio: plan.ratio, error: e });
            const message = formatGenerationError(e instanceof Error ? e.message : "Ошибка");
            for (const s of planSizes) updateTile(`${s.w}x${s.h}`, { status: "error", error: message });
            continue;
          }
        }

        if (cancelRef.current) break;
        // Carve every exact tile out of the source.
        for (const s of planSizes) {
          if (cancelRef.current) break;
          const exact = await cropWithRetry(sourceUrl, s.w, s.h, masterDataUrl);
          updateTile(`${s.w}x${s.h}`, { status: "done", dataUrl: exact });
          void persistResizeTile(basePayload.card_id, s, exact);
        }
      }

      patch({ status: "done" });
    },
    [patch, updateTile],
  );

  const removeTile = useCallback((id: string) => {
    setState((prev) => ({ ...prev, tiles: prev.tiles.filter((t) => t.id !== id) }));
  }, []);

  const regenerateTile = useCallback<GenerationContextValue["regenerateTile"]>(
    async (id) => {
      const snap = stateRef.current;
      const tile = snap.tiles.find((t) => t.id === id);
      const master = snap.imageUrl;
      if (!tile || !master) return;
      // Already regenerating this tile (e.g. a fast double-tap, or a tap while a
      // full-batch run is in flight) — ignore the second request so two calls
      // can't race and overwrite each other's result out of order.
      if (tile.status === "running" || snap.status === "batch_running") return;
      const basePayload = snap.lastPayload ?? ({} as GeneratePayload);
      const masterRatio = snap.lastMasterRatio;

      updateTile(id, { status: "running", error: undefined });
      // Keep the spinner on screen for a beat even when the work is an instant
      // client-side scale — avoids a jarring one-frame flash.
      const minVisible = new Promise((r) => setTimeout(r, 400));

      const cropWithRetry = async (src: string, w: number, h: number, fallback: string) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await centerCropToExact(src, w, h, "image/jpeg", 0.92);
          } catch {
            if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        return fallback;
      };

      try {
        // Resolve a remote master to a dataURL first (canvas is CORS-tainted
        // otherwise), same as runBatch.
        let masterDataUrl = master;
        if (master.startsWith("http://") || master.startsWith("https://")) {
          try {
            const r = await apiJson<{ dataUrl: string }>("/api/fetch-master", {
              method: "POST",
              body: JSON.stringify({ url: master }),
            });
            masterDataUrl = r.dataUrl;
          } catch {
            /* keep as-is; same-aspect crop may still work */
          }
        }

        // Plan this single size → the flare source aspect + canvas.
        const plan = planResizes([{ w: tile.size.w, h: tile.size.h }])[0];
        let sourceForCrop = masterDataUrl;
        // Source aspect differs from the (square) master → fresh flare i2i.
        // Same aspect → crop straight from the master, no API.
        const isMicro = !!plan && plan.detail !== "full";
        // Regenerate a source when the aspect differs from the master, or when
        // this is a micro tile (which needs its own stripped composition even
        // at 1:1). Same aspect + full detail → crop straight from the master.
        if (plan && (plan.ratio !== masterRatio || isMicro)) {
          let masterDetails: MasterDetails | null = null;
          if (!isMicro) {
            try {
              masterDetails = await extractMasterDetails(masterDataUrl);
            } catch {
              masterDetails = null;
            }
          }
          const i2iPayload: GeneratePayload = {
            ...basePayload,
            aspect_ratio: plan.ratio,
            source_image: masterDataUrl,
            target_w: plan.source.w,
            target_h: plan.source.h,
            master_details: isMicro ? undefined : masterDetails ?? undefined,
            group_id: isMicro ? plan.detail : tile.size.group_id,
            skip_history_attach: true,
          };
          try {
            const res = await generateImage(i2iPayload);
            sourceForCrop = res.image;
            // Explicit single-tile regenerate: this is the user's chosen
            // version — adopt it as the bucket's canonical source so a later
            // "Повторить упавшие" for a sibling in this bucket matches it.
            sourceCacheRef.current.set(
              `${masterEpochRef.current}|${plan.ratio}|${plan.detail}`,
              sourceForCrop,
            );
          } catch (e) {
            // content_filter → retry as t2i with the original prompt.
            if (e instanceof Error && e.message.startsWith("[content_filter]")) {
              const res = await generateImage({
                ...i2iPayload,
                source_image: undefined,
                master_details: undefined,
              });
              sourceForCrop = res.image;
              sourceCacheRef.current.set(
                `${masterEpochRef.current}|${plan.ratio}|${plan.detail}`,
                sourceForCrop,
              );
            } else {
              throw e;
            }
          }
        }

        const exact = await cropWithRetry(sourceForCrop, tile.size.w, tile.size.h, masterDataUrl);
        await minVisible;
        updateTile(id, { status: "done", dataUrl: exact, error: undefined });
        void persistResizeTile(basePayload.card_id, tile.size, exact);
      } catch (e) {
        await minVisible;
        updateTile(id, {
          status: "error",
          error: formatGenerationError(e instanceof Error ? e.message : "Ошибка"),
        });
      }
    },
    [updateTile],
  );

  const totalTiles = state.tiles.length;
  const doneTiles = state.tiles.filter((t) => t.status === "done").length;
  const runningTiles = state.tiles.filter((t) => t.status === "running").length;
  const isBusy = state.status === "master_running" || state.status === "batch_running";

  const value = useMemo<GenerationContextValue>(
    () => ({
      ...state,
      totalTiles,
      doneTiles,
      runningTiles,
      isBusy,
      runMaster,
      runBatch,
      cancel,
      regenerateTile,
      removeTile,
      clear,
      setMasterImage,
      setLastPayload,
    }),
    [
      state,
      totalTiles,
      doneTiles,
      runningTiles,
      isBusy,
      runMaster,
      runBatch,
      cancel,
      regenerateTile,
      removeTile,
      clear,
      setMasterImage,
      setLastPayload,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
