"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowLeft,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiJson, ApiError } from "@/lib/api-client";
import { PresetSidebar, PRESETS } from "./PresetSidebar";
import { AspectRatioPicker } from "./AspectRatioPicker";
import { ModelToggle, type ModelKey } from "./ModelToggle";
import { SettingsDrawer, getBrandSettings } from "./SettingsDrawer";
import { FullscreenImageModal } from "./FullscreenImageModal";
import { GenerationErrorCard } from "./GenerationErrorCard";
import { ToolCoachmark } from "./ToolCoachmark";
import { type Quality } from "./QualityPicker";
import { toast } from "sonner";
import { downloadAsJpg, type GeneratePayload, type UsageInfo } from "@/lib/imageGen";
import { formatGenerationError } from "@/lib/generation-errors";
import { bannerPresetToVertical } from "@/lib/landingGen";
import { ResizeBatchPanel, type SelectedSize } from "@/components/resize/ResizeBatchPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGeneration, type BatchTile } from "@/lib/generation-context";
import { useWorkspace } from "@/lib/workspace-context";
import { setUnsavedWork } from "@/lib/unsaved-work";
import { useConfirm } from "@/components/ui/confirm";
import { useAuthGate } from "@/components/AuthGate";
import { useEditorHistory, type Snapshot } from "@/lib/editor-history";

// gpt-image-2 поддерживает расширенный набор соотношений
const RATIOS_GPT = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4"];
const RATIOS_NANO = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "9:21",
];

/**
 * Reduce a width × height pair to one of our canonical aspect labels.
 * Uses the smallest absolute-difference match — good enough since the
 * master is always one of OpenAI's three native canvas sizes.
 */
function aspectFromDims(w: number, h: number): string {
  const r = w / h;
  const candidates: Array<[string, number]> = [
    ["1:1", 1],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
    ["4:5", 4 / 5],
    ["5:4", 5 / 4],
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(r - best[1]);
  for (const c of candidates) {
    const d = Math.abs(r - c[1]);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best[0];
}

const MODEL_IDS: Record<ModelKey, string> = {
  gpt: "openai/gpt-5.4-image-2",
  nano: "google/gemini-3.1-flash-image-preview",
};

const LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "Авто (по бренду)" },
  { value: "ru", label: "Русский" },
  { value: "uk", label: "Українська" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "pl", label: "Polski" },
];

type Status = "idle" | "loading" | "success" | "error";

export function ImageGenApp() {
  // Generation context lives at root level so the master image and
  // resize-batch progress survive navigation to /history or /admin. We
  // proxy through it here instead of holding local state for these
  // fields.
  const gen = useGeneration();
  const { isGuest, openGate } = useAuthGate();
  const router = useRouter();
  const imageUrl = gen.imageUrl;
  const lastUsage = gen.lastUsage;
  const lastPayload = gen.lastPayload;
  const lastMasterRatio = gen.lastMasterRatio;
  const setLastPayload = gen.setLastPayload;

  // preset + model persist across remounts so that when the user
  // navigates to /admin or /history and comes back, the form still
  // reflects what their active master was generated with. Without
  // this, useState would default back to "preset1"/"gpt" on remount
  // and the preview thumbnail (which lives under whatever preset is
  // selected) would show the master in the wrong category.
  const [preset, setPreset] = useState<string>(() => {
    if (typeof window === "undefined") return "preset1";
    try {
      // Deep-link from the Hub ("popular templates"): /banner?preset=preset2
      // wins over the persisted choice so a clicked template opens selected.
      const fromUrl = new URLSearchParams(window.location.search).get("preset");
      if (fromUrl && /^preset[1-4]$/.test(fromUrl)) return fromUrl;
      const stored = window.localStorage.getItem("dw_preset");
      if (stored && /^preset[1-4]$/.test(stored)) return stored;
    } catch {
      /* localStorage blocked — fall back */
    }
    return "preset1";
  });
  const [buttonText, setButtonText] = useState("");
  const [bannerText, setBannerText] = useState("");
  const [buttonTextEnabled, setButtonTextEnabled] = useState(false);
  const [bannerTextEnabled, setBannerTextEnabled] = useState(false);
  const [adTextsEnabled, setAdTextsEnabled] = useState(true);
  const [personEnabled, setPersonEnabled] = useState(true);
  const [personGender, setPersonGender] = useState<"female" | "male">("female");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelKey>(() => {
    if (typeof window === "undefined") return "gpt";
    try {
      const stored = window.localStorage.getItem("dw_model");
      if (stored === "gpt" || stored === "nano") return stored;
    } catch {
      /* localStorage blocked */
    }
    return "gpt";
  });
  const [ratio, setRatio] = useState("1:1");
  const [quality, setQuality] = useState<Quality>("low");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [language, setLanguage] = useState("auto");
  const [slotName, setSlotName] = useState("");
  const [slotScreenshot, setSlotScreenshot] = useState("");
  const [slotLogo, setSlotLogo] = useState("");
  const [eventText, setEventText] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [subheadlineEnabled, setSubheadlineEnabled] = useState(false);
  // sport preset state
  const [sportType, setSportType] = useState("");
  const [matchType, setMatchType] = useState("auto");
  const [sideAName, setSideAName] = useState("");
  const [sideALogo, setSideALogo] = useState("");
  const [sideBName, setSideBName] = useState("");
  const [sideBLogo, setSideBLogo] = useState("");
  const [eventName, setEventName] = useState("");
  const [matchDatetime, setMatchDatetime] = useState("");
  const [location, setLocation] = useState("");
  const [bonusText, setBonusText] = useState("");
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [playersEnabled, setPlayersEnabled] = useState(true);
  const [sideAPlayers, setSideAPlayers] = useState("");
  const [sideBPlayers, setSideBPlayers] = useState("");
  // Card pulled in from /history via ?card=<id>. When set, every resize
  // attaches to this card so re-runs don't fragment the history.
  // Re-pressing "Сгенерировать" (master gen) still creates a fresh card.
  const [loadedCardId, setLoadedCardId] = useState<string | null>(null);
  const [loadedCardName, setLoadedCardName] = useState<string | null>(null);

  // Warn on tab close / navigation when a freshly generated banner isn't saved
  // to a history card yet — Playable and Video already do this; Banner didn't,
  // so closing the tab silently lost the result. A banner loaded from history
  // (loadedCardId) is already persisted, so it doesn't count as unsaved.
  useEffect(() => {
    // Dirty = project-specific work not yet saved as a history card: a typed
    // topic ("Тематика баннера") or a freshly generated, unsaved result. A
    // banner loaded from history (loadedCardId) is already persisted.
    const dirty = !loadedCardId && (prompt.trim() !== "" || imageUrl !== null);
    setUnsavedWork(dirty ? "banner" : null);
    return () => setUnsavedWork(null);
  }, [imageUrl, loadedCardId, prompt]);

  const confirm = useConfirm();

  // Brand-kit prefill: a project created inside a workspace inherits that
  // client's brand kit (brand name + language) as defaults. Fills BLANKS only —
  // never clobbers a saved draft, user input, or a history-loaded card (skipped
  // entirely when opened via ?card=). Other generators can adopt the same hook.
  const { active: activeWorkspace } = useWorkspace();
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("card")) {
      return;
    }
    const bk = activeWorkspace?.brandKit;
    if (!bk) return;
    if (bk.brandName) setBrandName((cur) => (cur.trim() === "" ? bk.brandName : cur));
    if (bk.language && bk.language !== "auto") {
      setLanguage((cur) => (cur === "auto" ? bk.language : cur));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);
  // Preset the loaded card was originally created with. If the user
  // switches the preset to anything different after loading, we treat
  // the next resize batch as a NEW card so the new tiles don't bleed
  // into the original history entry.
  const [loadedFromPreset, setLoadedFromPreset] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const slotShotInputRef = useRef<HTMLInputElement>(null);
  const slotLogoInputRef = useRef<HTMLInputElement>(null);
  const sideALogoInputRef = useRef<HTMLInputElement>(null);
  const sideBLogoInputRef = useRef<HTMLInputElement>(null);
  const isSlotPreset = preset === "preset2";
  const isEventPreset = preset === "preset3";
  const isSportPreset = preset === "preset4";

  // load persisted brand settings
  useEffect(() => {
    const b = getBrandSettings();
    setBrandName(b.brand_name);
    setBrandLogo(b.brand_logo);
    // Default the field from the global creative language unless the brand has
    // an explicit (non-auto) language saved — a local override stays a local
    // override and isn't clobbered by the global.
    setLanguage(b.language || "auto");
    if (typeof window !== "undefined") {
      try {
        // History of generations is intentionally NOT persisted — proper
        // history will land as a separate feature later. We still wipe
        // any legacy gen_history so old thumbnails disappear after this
        // release.
        localStorage.removeItem("gen_history");
        const q = localStorage.getItem("gen_quality");
        if (q === "low" || q === "medium" || q === "high") setQuality(q);
      } catch {
        /* localStorage unavailable — ignore */
      }
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("gen_quality", quality);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [quality]);
  // Persist preset + model so a remount after navigation restores the
  // same form selection. Pairs with the useState initializers above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("dw_preset", preset);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [preset]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("dw_model", model);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [model]);

  // ?card=<id> entry point from /history "Использовать как мастер".
  // Pulls the card detail, drops the master image into the canvas,
  // mirrors form_snapshot into our form state (only fields the user
  // hasn't already typed into get overwritten), then strips the URL
  // param so refresh doesn't re-trigger the load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const cardId = url.searchParams.get("card");
    if (!cardId) return;

    type CardGeneration = {
      image_url: string | null;
      width: number | null;
      height: number | null;
    };
    type CardDetail = {
      id: string;
      name: string;
      preset_id: string;
      form_snapshot: Record<string, unknown>;
      master: CardGeneration | null;
      // Sibling resize generations (is_master=false) saved for this card. The
      // detail API returns these; the restore flow rehydrates them as tiles so
      // opening a project pulls the resizes too, not just the master.
      resizes?: CardGeneration[];
    };

    apiJson<{ card: CardDetail }>(`/api/history/${cardId}`)
      .then(({ card }) => {
        if (!card.master?.image_url) {
          setStatus("error");
          setErrorMsg("У карточки нет мастер-изображения");
          return;
        }
        const snap = card.form_snapshot || {};
        const getStr = (k: string): string =>
          typeof snap[k] === "string" ? (snap[k] as string) : "";
        const getBool = (k: string, fallback: boolean): boolean =>
          typeof snap[k] === "boolean" ? (snap[k] as boolean) : fallback;
        const overwriteIfEmpty = (current: string, fresh: string) =>
          current.trim() === "" ? fresh : current;

        // Preset switches even if user picked another — they came here
        // explicitly via "Использовать как мастер", they expect the
        // original preset. We also remember THIS preset value so the
        // detach-on-preset-change effect below knows what's "original".
        const originalPreset =
          typeof snap.preset_id === "string" && snap.preset_id
            ? (snap.preset_id as string)
            : card.preset_id || null;
        if (originalPreset) {
          setPreset(originalPreset);
        }
        setLoadedFromPreset(originalPreset);

        // Aspect: derive from master width/height (cheaper than parsing
        // snap.aspect_ratio which might be missing). lastMasterRatio is
        // set by gen.setMasterImage below — here we only sync the form
        // ratio picker so the UI reflects the loaded master.
        let derivedRatio = "1:1";
        if (card.master.width && card.master.height) {
          derivedRatio = aspectFromDims(card.master.width, card.master.height);
        } else if (typeof snap.aspect_ratio === "string") {
          derivedRatio = snap.aspect_ratio as string;
        }
        setRatio(derivedRatio);

        // Text fields — overwrite only if the user hasn't typed anything.
        setPrompt((cur) => overwriteIfEmpty(cur, getStr("subject")));
        setBannerText((cur) => overwriteIfEmpty(cur, getStr("banner_text")));
        setButtonText((cur) => overwriteIfEmpty(cur, getStr("button_text")));
        setBrandName((cur) => overwriteIfEmpty(cur, getStr("brand_name")));
        setSlotName((cur) => overwriteIfEmpty(cur, getStr("slot_name")));
        setEventText((cur) => overwriteIfEmpty(cur, getStr("event_text")));
        setSubheadline((cur) => overwriteIfEmpty(cur, getStr("subheadline_text")));
        setSportType((cur) => overwriteIfEmpty(cur, getStr("sport_type")));
        setMatchType((cur) => overwriteIfEmpty(cur, getStr("match_type")));
        setSideAName((cur) => overwriteIfEmpty(cur, getStr("side_a_name")));
        setSideBName((cur) => overwriteIfEmpty(cur, getStr("side_b_name")));
        setEventName((cur) => overwriteIfEmpty(cur, getStr("event_name")));
        setMatchDatetime((cur) => overwriteIfEmpty(cur, getStr("match_datetime")));
        setLocation((cur) => overwriteIfEmpty(cur, getStr("location")));
        setBonusText((cur) => overwriteIfEmpty(cur, getStr("bonus_text")));
        setSideAPlayers((cur) => overwriteIfEmpty(cur, getStr("side_a_players")));
        setSideBPlayers((cur) => overwriteIfEmpty(cur, getStr("side_b_players")));
        if (typeof snap.language === "string") {
          setLanguage(snap.language as string);
        }
        setBannerTextEnabled(getBool("banner_text_enabled", false));
        setButtonTextEnabled(getBool("button_text_enabled", false));
        setSubheadlineEnabled(getBool("subheadline_enabled", false));
        setBonusEnabled(getBool("bonus_enabled", false));
        setPlayersEnabled(getBool("players_enabled", true));
        setAdTextsEnabled(getBool("ad_texts_enabled", true));
        setPersonEnabled(getBool("person_enabled", true));

        // Master canvas + lastPayload land together in the global
        // generation context so navigation away from / doesn't drop
        // them.
        setStatus("success");
        setLoadedCardId(card.id);
        setLoadedCardName(card.name);

        const restoredPayload: GeneratePayload = {
          preset_id:
            (typeof snap.preset_id === "string" ? (snap.preset_id as string) : card.preset_id) ||
            "preset1",
          button_text: getStr("button_text"),
          banner_text: getStr("banner_text"),
          prompt: getStr("subject") || getStr("slot_name"),
          model: typeof snap.model === "string" ? (snap.model as string) : MODEL_IDS.gpt,
          aspect_ratio: derivedRatio,
          ad_texts_enabled: getBool("ad_texts_enabled", true),
          person_enabled: getBool("person_enabled", true),
          person_gender:
            snap.person_gender === "male" || snap.person_gender === "female"
              ? (snap.person_gender as "male" | "female")
              : null,
          brand_name: getStr("brand_name"),
          language: typeof snap.language === "string" ? (snap.language as string) : "auto",
          slot_name: getStr("slot_name"),
          event_text: getStr("event_text"),
          subheadline_text: getStr("subheadline_text"),
          banner_text_enabled: getBool("banner_text_enabled", false),
          button_text_enabled: getBool("button_text_enabled", false),
          subheadline_enabled: getBool("subheadline_enabled", false),
          sport_type: getStr("sport_type"),
          match_type: getStr("match_type"),
          side_a_name: getStr("side_a_name"),
          side_b_name: getStr("side_b_name"),
          event_name: getStr("event_name"),
          match_datetime: getStr("match_datetime"),
          location: getStr("location"),
          bonus_text: getStr("bonus_text"),
          bonus_enabled: getBool("bonus_enabled", false),
          players_enabled: getBool("players_enabled", true),
          side_a_players: getStr("side_a_players"),
          side_b_players: getStr("side_b_players"),
          quality:
            snap.quality === "low" || snap.quality === "medium" || snap.quality === "high"
              ? (snap.quality as "low" | "medium" | "high")
              : "low",
          card_id: card.id,
        };
        // Rehydrate the resize grid: every saved resize becomes a "done" tile
        // showing its stored image, so the project opens with master + resizes
        // (deduped by w×h; the saved URL is the tile image directly).
        const seenTiles = new Set<string>();
        const restoredTiles: BatchTile[] = [];
        for (const r of card.resizes ?? []) {
          if (!r.image_url || !r.width || !r.height) continue;
          const id = `${r.width}x${r.height}`;
          if (seenTiles.has(id)) continue;
          seenTiles.add(id);
          restoredTiles.push({
            id,
            size: { w: r.width, h: r.height, ratio: aspectFromDims(r.width, r.height) },
            status: "done",
            kind: "scale_from_master",
            dataUrl: r.image_url,
          });
        }

        gen.setMasterImage({
          image: card.master.image_url,
          payload: restoredPayload,
          ratio: derivedRatio,
          cardId: card.id,
          tiles: restoredTiles,
        });

        // Clean the URL so reload doesn't re-trigger.
        url.searchParams.delete("card");
        const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
        window.history.replaceState({}, "", cleaned);
      })
      .catch((e) => {
        setStatus("error");
        setErrorMsg(e instanceof ApiError ? e.message : "Не удалось загрузить карточку из истории");
      });
    // Empty deps: runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("brand_name", brandName);
    localStorage.setItem("brand_language", language);
    if (brandLogo) localStorage.setItem("brand_logo", brandLogo);
    else localStorage.removeItem("brand_logo");
  }, [brandName, brandLogo, language]);

  // Detach + auto-clone when the user moves the loaded master into a
  // different preset. We POST /api/history/clone-card which creates a
  // fresh card (under the NEW preset) pointing at the same master FTP
  // file. Resizes then attach to the clone — original card stays
  // untouched in the original preset's history.
  //
  // We compare to loadedFromPreset (the snapshot's preset, captured at
  // card-load time) rather than initial mount state, so the auto-switch
  // performed during the snapshot apply doesn't trip this branch.
  useEffect(() => {
    if (!loadedCardId || !loadedFromPreset) return;
    if (preset === loadedFromPreset) return;
    const oldCardId = loadedCardId;
    const newPreset = preset;
    // Optimistically clear so a fast second preset change doesn't fire
    // a second clone request before the first resolves.
    setLoadedCardId(null);
    setLoadedCardName(null);
    setLoadedFromPreset(null);
    setLastPayload((prev) => (prev ? { ...prev, card_id: undefined } : prev));

    apiJson<{ card_id: string; name: string; preset_id: string }>("/api/history/clone-card", {
      method: "POST",
      json: { source_card_id: oldCardId, preset_id: newPreset },
    })
      .then((r) => {
        setLoadedCardId(r.card_id);
        setLoadedCardName(r.name);
        setLoadedFromPreset(r.preset_id);
        setLastPayload((prev) => (prev ? { ...prev, card_id: r.card_id } : prev));
      })
      .catch((e) => {
        // Non-fatal: tiles just won't persist this round. Surface via
        // the existing error message slot so the user knows.
        setErrorMsg(
          e instanceof ApiError
            ? `Не удалось создать новую карточку под пресет: ${e.message}`
            : "Не удалось создать новую карточку под этот пресет",
        );
      });
  }, [preset, loadedCardId, loadedFromPreset]);
  const compressImageFile = (file: File | null, setter: (v: string) => void, maxPx = 512) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("Файл слишком большой (макс 8MB)");
      return;
    }
    const reader = new FileReader();
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") return;
      const img = new Image();
      img.onload = () => {
        const iw = img.width || maxPx;
        const ih = img.height || maxPx;
        const scale = Math.min(1, maxPx / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setter(r);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setter(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => setter(r);
      img.src = r;
    };
    if (isSvg) {
      reader.readAsText(file);
      reader.onload = () => {
        const text = reader.result;
        if (typeof text !== "string") return;
        const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        const img = new Image();
        img.onload = () => {
          const iw = img.width || maxPx;
          const ih = img.height || maxPx;
          const scale = Math.min(1, maxPx / Math.max(iw, ih));
          const w = Math.max(1, Math.round(iw * scale));
          const h = Math.max(1, Math.round(ih * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          setter(canvas.toDataURL("image/png"));
        };
        img.src = svgUrl;
      };
    } else {
      reader.readAsDataURL(file);
    }
  };

  const onLogoFile = (file: File | null) => compressImageFile(file, setBrandLogo, 256);

  const ratios = useMemo(() => (model === "gpt" ? RATIOS_GPT : RATIOS_NANO), [model]);
  const currentPreset = PRESETS.find((p) => p.id === preset);

  // Switching the preset or model invalidates a FRESHLY-generated
  // master — its image was made for the old brief and is misleading
  // under a new one. But:
  //   1. On the very FIRST mount this effect would also fire (React
  //      effects run on mount), wiping any in-progress generation that
  //      the user left running in the global context while they were
  //      visiting /history or /admin. We skip that with a ref.
  //   2. When the master was LOADED from history, changing the preset
  //      triggers the clone-card flow (see effect below) which
  //      re-targets the same master at a new card under the new
  //      preset, so we must NOT wipe imageUrl / lastPayload there.
  // Mirror the current master image into the in-memory `history`
  // preview list whenever the context's imageUrl changes. This restores
  // the thumbnail + zoom-on-click control after a remount and after a
  // fresh generation.
  //
  // IMPORTANT: only `imageUrl` is in the dep array. If we put `preset`
  // there too, switching preset while imageUrl is still set (e.g.
  // before gen.clear() finishes its render) would cross-add the old
  // master to the new preset's history list.
  useEffect(() => {
    if (!imageUrl) return;
    setHistory((prev) => {
      const list = prev[preset] ?? [];
      if (list[0] === imageUrl) return prev;
      return { ...prev, [preset]: [imageUrl, ...list.filter((s) => s !== imageUrl)].slice(0, 30) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const presetWatcherInitialized = useRef(false);
  useEffect(() => {
    if (!presetWatcherInitialized.current) {
      presetWatcherInitialized.current = true;
      return; // first mount — preserve whatever context already holds
    }
    if (loadedCardId) return; // history flow — clone-card handles it
    // Don't blow up a generation in flight just because the user
    // bounced the preset/model picker — clear is meant to invalidate a
    // stale FINISHED master, not abort an active job. The active job's
    // cardId and basePayload are already locked in.
    if (gen.isBusy) return;
    gen.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, model]);

  const onLaunchBatch = (sizes: SelectedSize[]) => {
    if (!imageUrl || !lastPayload) return;
    void gen.runBatch({
      sizes,
      master: imageUrl,
      masterRatio: lastMasterRatio,
      basePayload: lastPayload,
    });
  };

  const onModelChange = (m: ModelKey) => {
    setModel(m);
    const next = m === "gpt" ? RATIOS_GPT : RATIOS_NANO;
    if (!next.includes(ratio)) setRatio("1:1");
  };

  const onGenerate = async () => {
    // Guests may browse and configure freely, but generating needs an account.
    // Gated here (not on the buttons) so "Перегенерировать" is covered too.
    if (isGuest) {
      openGate();
      return;
    }
    // Guard EVERY generation path against an empty required field. The two
    // "Сгенерировать" buttons gate via `disabled`, but the "Перегенерировать"
    // menu item calls this directly — without this check it would wipe a
    // finished banner and start a new one from almost nothing.
    const requiredEmpty =
      (!isSlotPreset && prompt.trim().length === 0) ||
      (isSlotPreset && slotName.trim().length === 0);
    if (requiredEmpty) {
      toast.error(
        `Заполните «${
          isSlotPreset
            ? "Название слота"
            : isSportPreset
              ? "Опишите матч / событие"
              : "Тематика баннера"
        }», чтобы сгенерировать`,
      );
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    // A fresh master generation always starts a new card. The history
    // banner clears so the UI doesn't lie about provenance.
    setLoadedCardId(null);
    setLoadedCardName(null);
    setLoadedFromPreset(null);
    // Build the payload ONCE so we can both send it and remember it.
    const payload: GeneratePayload = {
      preset_id: preset,
      button_text: buttonTextEnabled ? buttonText : "",
      banner_text: bannerTextEnabled ? bannerText : "",
      prompt: isSlotPreset ? slotName : prompt,
      model: MODEL_IDS[model],
      aspect_ratio: ratio,
      ad_texts_enabled: isSlotPreset || isSportPreset ? true : adTextsEnabled,
      person_enabled: isSlotPreset || isSportPreset ? false : personEnabled,
      person_gender: isSlotPreset || isSportPreset ? null : personEnabled ? personGender : null,

      brand_name: brandName,
      brand_logo: brandLogo,
      language: language,
      slot_name: isSlotPreset ? slotName : "",
      slot_screenshot: isSlotPreset ? slotScreenshot : "",
      slot_logo: isSlotPreset ? slotLogo : "",
      event_text: isEventPreset ? eventText : "",
      subheadline_text: (isEventPreset || isSportPreset) && subheadlineEnabled ? subheadline : "",
      banner_text_enabled: bannerTextEnabled,
      button_text_enabled: buttonTextEnabled,
      subheadline_enabled: (isEventPreset || isSportPreset) && subheadlineEnabled,
      sport_type: isSportPreset ? sportType : "",
      match_type: isSportPreset ? matchType : "",
      side_a_name: isSportPreset ? sideAName : "",
      side_a_logo: isSportPreset ? sideALogo : "",
      side_b_name: isSportPreset ? sideBName : "",
      side_b_logo: isSportPreset ? sideBLogo : "",
      event_name: isSportPreset ? eventName : "",
      match_datetime: isSportPreset ? matchDatetime : "",
      location: isSportPreset ? location : "",
      bonus_text: isSportPreset && bonusEnabled ? bonusText : "",
      bonus_enabled: isSportPreset && bonusEnabled,
      players_enabled: isSportPreset ? playersEnabled : undefined,
      side_a_players: isSportPreset && playersEnabled ? sideAPlayers : "",
      side_b_players: isSportPreset && playersEnabled ? sideBPlayers : "",
      quality,
    };
    try {
      // runMaster pushes imageUrl + lastPayload + lastMasterRatio into
      // the context directly, but it ALSO returns the fresh image
      // string. We use the return value (not gen.imageUrl, which would
      // be stale in this closure) to seed the in-memory thumbnail list.
      const img = await gen.runMaster(payload);
      setStatus("success");
      if (img) {
        setHistory((prev) => {
          const list = prev[preset] ? [img, ...prev[preset]] : [img];
          return { ...prev, [preset]: list.slice(0, 30) };
        });
      }
    } catch (e) {
      setErrorMsg(formatGenerationError(e instanceof Error ? e.message : "Unknown error"));
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setErrorMsg("");
    gen.clear();
  };

  // Abort a running master generation and return to the settings screen so the
  // user can tweak and retry. gen.cancel() flips master_running → idle; the
  // orphaned request (if it later resolves) is ignored via cancelRef, so it
  // can't resurrect a result. Gives mobile a real exit from the loader.
  const cancelMaster = () => {
    gen.cancel();
    setStatus("idle");
    setMobileTab("settings");
  };

  // "Начать заново" — clears the generated result and returns the editor
  // to its empty starting state (form inputs are kept so the user can tweak
  // and regenerate). Does not touch generation logic beyond clearing.
  // Because this discards a fresh, not-yet-saved master, confirm first so a
  // stray click can't silently destroy the user's banner.
  const backToStart = async () => {
    if (imageUrl !== null && !loadedCardId && !gen.isBusy) {
      const ok = await confirm({ title: "Начать заново?", body: "Текущий баннер будет удалён.", destructive: true, confirmLabel: "Начать заново" });
      if (!ok) return;
    }
    reset();
    setLoadedCardId(null);
    setLoadedCardName(null);
    setLoadedFromPreset(null);
  };

  // Picking a different template invalidates a freshly-generated master —
  // the [preset] effect above calls gen.clear() on the change. If such a
  // result exists and isn't already safely saved in history, confirm before
  // discarding it; otherwise the switch is free and silent.
  const changePreset = async (p: string) => {
    if (p !== preset && imageUrl !== null && !loadedCardId && !gen.isBusy) {
      const ok = await confirm({ title: "Сменить шаблон?", body: "Текущий баннер будет удалён.", destructive: true, confirmLabel: "Сменить" });
      if (!ok) return;
    }
    setPreset(p);
    // On mobile, picking a template advances to the settings screen.
    setMobileTab("settings");
  };

  return (
    <div className="bg-background text-foreground">
      <ToolCoachmark section="banner" />
      {/* Settings icon hidden — настройки бренда доступны прямо в форме */}

      {/* Fill exactly the viewport below the sticky 4rem header so the columns
          never push the page into a scroll — the left templates column stays
          fixed; only the middle settings + result columns scroll internally. */}
      <div className="flex flex-col p-0 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-3">
        <h1 className="sr-only">Image Generator</h1>

        <PresetSidebar value={preset} onChange={setPreset} />

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {/* TOP — history for current preset.
              Single source of truth for the active master is gen.imageUrl
              from the root-level context (survives navigation). The
              local `history` list is just a session-scoped breadcrumb
              of additional thumbnails the user generated this visit. */}
          {(() => {
            const items = history[preset] ?? [];
            // Show whenever there's an active master in the context OR
            // any session history OR a loading / error state.
            const showSection =
              imageUrl !== null ||
              items.length > 0 ||
              status === "loading" ||
              status === "error" ||
              gen.status === "master_running";
            if (!showSection) return null;
            // Build the preview list: gen.imageUrl first (most current),
            // then any older thumbnails from session history. Dedupe so
            // we don't show the same image twice if history-sync
            // already added it.
            const previewItems = imageUrl
              ? [imageUrl, ...items.filter((s) => s !== imageUrl)]
              : items;
            return (
              <section className="rounded-2xl border border-border bg-panel p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    История: <span className="text-foreground/70">{currentPreset?.name}</span>
                  </h2>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        // In-memory clear only — history isn't persisted.
                        setHistory((prev) => {
                          const next = { ...prev };
                          delete next[preset];
                          return next;
                        });
                      }}
                      className="text-xs text-foreground/50 hover:text-foreground"
                    >
                      Очистить
                    </button>
                  )}
                </div>

        {/* COLUMN 2 — settings panel. Every field stacked vertically. */}
        <section
          className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none lg:h-full lg:flex-[4] lg:rounded-2xl lg:border ${
            mobileTab !== "settings" ? "max-lg:hidden" : ""
          }`}
        >
          {/* Mobile-only screen header: back to templates. */}
          <div className="px-2 pb-3 pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("templates")}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-6">
              {!isSlotPreset && (
                <div>
                  <label className="mb-2 block ds-h4">
                    {isSportPreset ? "Опишите матч / событие" : "Тематика баннера"}{" "}
                    <span className="text-accent-green">*</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    className="min-h-[96px] w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm outline-none focus:border-accent-green"
                    placeholder={
                      isSportPreset
                        ? "Например: финал Лиги Чемпионов между PSG и Liverpool…"
                        : isEventPreset
                          ? "Например: турнир по покеру на новогодние праздники, призовой фонд $100k…"
                          : "Покерный турнир, акция, фри спины, кэшбэк, новый слот…"
                    }
                  />
                </div>
              )}

              {isEventPreset && (
                <div>
                  <label className="mb-2 block ds-h4">
                    Событие / повод <span className="text-muted-foreground">(опционально)</span>
                  </label>
                  <input
                    type="text"
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                    placeholder="Новый год, Пасха, День независимости, Black Friday…"
                  />
                </div>
              )}

              {isSlotPreset && (
                <div className="rounded-xl border border-border bg-background/40 p-3">
                  <p className="mb-2 ds-h4">
                    Слот <span className="text-[color:var(--status-error)]">*</span>
                  </p>
                  <input
                    type="text"
                    value={slotName}
                    onChange={(e) => setSlotName(e.target.value)}
                    placeholder="Название слота (например, Sweet Bonanza)"
                    className="mb-3 w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  />
                  <div className="flex flex-wrap gap-3">
                    <div className="w-24">
                      <SlotUpload
                        label="Скриншот слота"
                        value={slotScreenshot}
                        onClear={() => setSlotScreenshot("")}
                        onPick={() => slotShotInputRef.current?.click()}
                        inputRef={slotShotInputRef}
                        onFile={(f) => compressImageFile(f, setSlotScreenshot, 512)}
                        aspect="square"
                      />
                    </div>
                    <div className="w-24">
                      <SlotUpload
                        label="Логотип слота"
                        value={slotLogo}
                        onClear={() => setSlotLogo("")}
                        onPick={() => slotLogoInputRef.current?.click()}
                        inputRef={slotLogoInputRef}
                        onFile={(f) => compressImageFile(f, setSlotLogo, 256)}
                        aspect="square"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-foreground/50">
                    Скриншот станет ключевым визуалом, логотип будет размещён по правилам шаблона.
                  </p>
                </div>
              )}

              {isSportPreset && (
                <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
                  <p className="ds-h4">Параметры матча</p>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Тип спорта
                      </label>
                      <select
                        value={sportType}
                        onChange={(e) => setSportType(e.target.value)}
                        className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      >
                        <option value="">Авто (определить из брифа)</option>
                        <option value="football">Футбол</option>
                        <option value="basketball">Баскетбол</option>
                        <option value="tennis">Теннис</option>
                        <option value="boxing">Бокс</option>
                        <option value="mma">ММА / UFC</option>
                        <option value="hockey">Хоккей</option>
                        <option value="baseball">Бейсбол</option>
                        <option value="american_football">Американский футбол</option>
                        <option value="esports">Киберспорт</option>
                        <option value="f1">Формула 1</option>
                        <option value="rugby">Регби</option>
                        <option value="cricket">Крикет</option>
                        <option value="badminton">Бадминтон</option>
                        <option value="volleyball">Волейбол</option>
                        <option value="other">Другое</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Тип матча
                      </label>
                      <select
                        value={matchType}
                        onChange={(e) => setMatchType(e.target.value)}
                        className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      >
                        <option value="auto">Определить автоматически</option>
                        <option value="national">Сборные / Национальные</option>
                        <option value="clubs">Клубы</option>
                        <option value="individual">Индивидуальные / Личные</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Сторона A
                      </label>
                      <input
                        type="text"
                        value={sideAName}
                        onChange={(e) => setSideAName(e.target.value)}
                        placeholder="Команда / игрок"
                        className="mb-2 w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                      <div className="w-24">
                        <SlotUpload
                          label="Лого / флаг A"
                          value={sideALogo}
                          onClear={() => setSideALogo("")}
                          onPick={() => sideALogoInputRef.current?.click()}
                          inputRef={sideALogoInputRef}
                          onFile={(f) => compressImageFile(f, setSideALogo, 256)}
                          aspect="square"
                        />
                      </div>
                    </div>
                    <span className="pb-2 text-base font-bold text-accent-green">VS</span>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Сторона B
                      </label>
                      <input
                        type="text"
                        value={sideBName}
                        onChange={(e) => setSideBName(e.target.value)}
                        placeholder="Команда / игрок"
                        className="mb-2 w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                      <div className="w-24">
                        <SlotUpload
                          label="Лого / флаг B"
                          value={sideBLogo}
                          onClear={() => setSideBLogo("")}
                          onPick={() => sideBLogoInputRef.current?.click()}
                          inputRef={sideBLogoInputRef}
                          onFile={(f) => compressImageFile(f, setSideBLogo, 256)}
                          aspect="square"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Название события
                      </label>
                      <input
                        type="text"
                        value={eventName}
                        onChange={(e) => setEventName(e.target.value)}
                        placeholder="UFC 312, Champions League Final…"
                        className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Дата и время
                      </label>
                      <input
                        type="text"
                        value={matchDatetime}
                        onChange={(e) => setMatchDatetime(e.target.value)}
                        placeholder="SAT OCT 17, 9:24 PM"
                        className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                        Локация / стадион
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Wembley, MSG, Camp Nou…"
                        className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                      />
                    </div>
                  </div>

                  <OptionalField
                    label="Бонус / коэффициент"
                    enabled={bonusEnabled}
                    onToggle={setBonusEnabled}
                    value={bonusText}
                    onChange={setBonusText}
                    placeholder="+200% на первую ставку, Odds Boost 5.0…"
                  />

                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="ds-h4">Игроки на баннере</p>
                        <p className="mt-1 ds-caption leading-relaxed">
                          Выключено — только символика: эмблемы, флаги, трофеи
                        </p>
                      </div>
                      <ToggleSwitch enabled={playersEnabled} onToggle={setPlayersEnabled} />
                    </div>
                    {playersEnabled && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                              Сторона A — Игрок(и)
                            </label>
                            <input
                              type="text"
                              value={sideAPlayers}
                              onChange={(e) => setSideAPlayers(e.target.value)}
                              placeholder="Например: Мбаппе, Дембеле"
                              className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                            />
                            <p className="mt-1 text-[11px] text-foreground/50">
                              Если пусто — нейросеть подберёт топового игрока автоматически
                            </p>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-foreground/70">
                              Сторона B — Игрок(и)
                            </label>
                            <input
                              type="text"
                              value={sideBPlayers}
                              onChange={(e) => setSideBPlayers(e.target.value)}
                              placeholder="Например: Салах"
                              className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                            />
                            <p className="mt-1 text-[11px] text-foreground/50">
                              Если пусто — нейросеть подберёт топового игрока автоматически
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-foreground/60">
                          💡 Можно указать одного или нескольких игроков через запятую. В
                          индивидуальных видах спорта (бокс, теннис, ММА) — обычно сам спортсмен. В
                          командных — звезда команды.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="mb-2 ds-h4">Бренд</p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {brandLogo ? (
                      <div className="relative">
                        <img
                          src={brandLogo}
                          alt="brand logo"
                          className="h-24 w-24 rounded-md border border-border bg-white object-contain p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setBrandLogo("")}
                          aria-label="Удалить логотип"
                          className="absolute -right-2 -top-2 rounded-full bg-foreground p-0.5 text-background hover:opacity-80"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-[11px] text-foreground/50 hover:border-foreground/40 hover:text-foreground/80"
                      >
                        <Upload size={16} />
                        Лого
                      </button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*,.svg"
                      className="hidden"
                      onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Название бренда / проекта"
                    className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  />
                </div>
                <p className="mt-2 ds-caption">
                  Логотип и название будут учтены при генерации.
                </p>
              </div>

              {/* Языки — язык ТЕКСТА в креативе. Локальная настройка раздела,
                  не связана с языком интерфейса (тот переключается в шапке). */}
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="mb-2 ds-h4">Языки</p>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-12 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
                  aria-label="Язык текстов на креативе"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 ds-caption">
                  Язык текста на самом креативе — не связан с языком интерфейса.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <OptionalField
                  label="Текст на баннере"
                  enabled={bannerTextEnabled}
                  onToggle={setBannerTextEnabled}
                  value={bannerText}
                  onChange={setBannerText}
                  placeholder={isEventPreset ? "Пусто = ИИ сгенерирует" : "Летняя акция"}
                />
                <OptionalField
                  label="Текст на кнопке"
                  enabled={buttonTextEnabled}
                  onToggle={setButtonTextEnabled}
                  value={buttonText}
                  onChange={setButtonText}
                  placeholder={isEventPreset ? "Пусто = ИИ сгенерирует" : "Купить"}
                />
              </div>

              {(isEventPreset || isSportPreset) && (
                <OptionalField
                  label="Подзаголовок / преимущества"
                  enabled={subheadlineEnabled}
                  onToggle={setSubheadlineEnabled}
                  value={subheadline}
                  onChange={setSubheadline}
                  placeholder="Пусто = ИИ сгенерирует 2–3 преимущества"
                />
              )}

              {!isSlotPreset && !isSportPreset && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="ds-h4">Рекламные тексты в промпте</p>
                        <p className="mt-0.5 ds-caption">Заголовок, фичи, цифры из шаблона</p>
                      </div>
                      <ToggleSwitch enabled={adTextsEnabled} onToggle={setAdTextsEnabled} />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="ds-h4">Человек в кадре</p>
                        <p className="mt-0.5 ds-caption">Модель как центральный субъект</p>
                      </div>
                      <ToggleSwitch enabled={personEnabled} onToggle={setPersonEnabled} />
                    </div>
                    {personEnabled && (
                      <div className="mt-3 flex gap-2">
                        {(["female", "male"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setPersonGender(g)}
                            className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                              personGender === g
                                ? "border-accent-green bg-accent-green/10 text-accent-green"
                                : "border-border text-foreground/70 hover:bg-white/5"
                            }`}
                          >
                            {g === "female" ? "Девушка" : "Мужчина"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Соотношение сторон. Качество и модель (Артистизм/Реализм) скрыты
                  из UI — модель всегда "Артистизм" (дефолт из useState), а
                  качество остаётся на своём значении по умолчанию ("low"). */}
              <div className="mt-2 flex flex-col gap-4">
                <div className="min-w-0">
                  <p className="mb-2 ds-h4">Соотношение сторон</p>
                  <AspectRatioPicker ratios={ratios} value={ratio} onChange={setRatio} />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile-only pinned primary: generate straight from settings. */}
          <div className="shrink-0 border-t border-border bg-panel p-3 lg:hidden">
            <button
              type="button"
              onClick={onGenerate}
              disabled={
                !isGuest &&
                (status === "loading" ||
                  gen.isBusy ||
                  (!isSlotPreset && prompt.trim().length === 0) ||
                  (isSlotPreset && slotName.trim().length === 0))
              }
              className="min-h-12 w-full rounded-lg bg-accent-green px-8 text-base font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? "Генерация…" : imageUrl ? "Сгенерировать заново" : "Сгенерировать"}
            </button>
            {((!isSlotPreset && prompt.trim().length === 0) ||
              (isSlotPreset && slotName.trim().length === 0)) &&
            status !== "loading" &&
            !gen.isBusy ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Заполните «
                {isSlotPreset
                  ? "Название слота"
                  : isSportPreset
                    ? "Опишите матч / событие"
                    : "Тематика баннера"}
                », чтобы сгенерировать
              </p>
            ) : null}
          </div>
        </section>

        {/* COLUMN 3 — generation area. Button on top, result below. */}
        <div
          className={`flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto max-lg:h-[calc(100dvh-4rem)] max-lg:flex-none max-lg:p-4 lg:h-full lg:flex-[4] ${
            mobileTab !== "result" ? "max-lg:hidden" : ""
          }`}
        >
          {/* Mobile-only screen header: back to settings. Hidden while the
              master is actively generating (can't leave the loader). */}
          {status !== "loading" && gen.status !== "master_running" ? (
            <button
              type="button"
              onClick={() => setMobileTab("settings")}
              className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
          ) : null}

          {/* "Начать заново" — discards the current result and returns the
              editor to its empty starting state. Desktop only (both columns are
              visible side by side here, so this is a reset, not navigation);
              mobile uses the screen-header back above, which only switches tab.
              Hidden while the master is actively generating: the loader's own
              "Отменить" is the correct action then (mirrors the mobile back,
              which is also hidden during generation). */}
          {(hasBanner ||
            status !== "idle" ||
            gen.status === "master_running" ||
            gen.status === "batch_running") &&
          !(status === "loading" || gen.status === "master_running") ? (
            <button
              type="button"
              onClick={backToStart}
              className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground max-lg:hidden"
            >
              <RefreshCw className="h-4 w-4" />
              Начать заново
            </button>
          ) : null}

          {/* Flow steps — step 2 lights up once a banner exists. Kept compact
              (12px) so the two labels stay on one line; it's a progress
              indicator, not body content. */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  hasBanner ? "bg-muted text-muted-foreground" : "bg-accent-green text-on-accent"
                }`}
              >
                1
              </span>
              <span className={hasBanner ? "text-muted-foreground" : "font-medium text-foreground"}>
                Генерация баннера
              </span>
            </div>
            <span className="h-px w-6 bg-border" />
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  hasBanner
                    ? "bg-accent-green text-on-accent"
                    : "border border-border text-muted-foreground"
                }`}
              >
                2
              </span>
              <span className={hasBanner ? "font-medium text-foreground" : "text-muted-foreground"}>
                Выбор ресайзов
              </span>
            </div>
          </div>

          {/* Master-generate button. On mobile it lives only on the settings
              screen (single sticky CTA); here it's desktop-only to avoid a
              duplicate. */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={
              !isGuest &&
              (status === "loading" ||
                gen.isBusy ||
                (!isSlotPreset && prompt.trim().length === 0) ||
                (isSlotPreset && slotName.trim().length === 0))
            }
            className="w-full rounded-lg bg-accent-green px-8 py-3 text-base font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 max-lg:hidden lg:text-sm"
          >
            {status === "loading" ? "Генерация…" : imageUrl ? "Сгенерировать заново" : "Сгенерировать"}
          </button>
          {((!isSlotPreset && prompt.trim().length === 0) ||
            (isSlotPreset && slotName.trim().length === 0)) &&
          status !== "loading" &&
          !gen.isBusy ? (
            <p className="-mt-1 text-center text-xs text-muted-foreground max-lg:hidden">
              Заполните «
              {isSlotPreset
                ? "Название слота"
                : isSportPreset
                  ? "Опишите матч / событие"
                  : "Тематика баннера"}
              », чтобы сгенерировать
            </p>
          ) : null}

          {loadedCardId && loadedCardName ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-accent-green/40 bg-accent-green/5 px-3 py-2 text-xs">
              <span className="min-w-0">
                Загружено из истории: <span className="font-medium">{loadedCardName}</span>. Ресайзы
                добавятся в эту карточку.
              </span>
              <button
                type="button"
                onClick={() => {
                  setLoadedCardId(null);
                  setLoadedCardName(null);
                  setLoadedFromPreset(null);
                  setLastPayload((prev) => (prev ? { ...prev, card_id: undefined } : prev));
                }}
                className="relative ml-2 shrink-0 text-muted-foreground transition after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
                aria-label="Отвязать"
                title="Создать новую карточку при следующем ресайзе"
              >
                ✕
              </button>
            </div>
          ) : null}

          {/* Staged flow: idle → loading → result (approve) → resize (after approve) */}
          {(() => {
            // DEV preview: force the result screen with a placeholder banner.
            const imageUrl = DEV_PREVIEW_RESULT ? DEV_PREVIEW_IMAGE : gen.imageUrl;
            const lastPayload = DEV_PREVIEW_RESULT
              ? ({ preset_id: preset } as unknown as GeneratePayload)
              : gen.lastPayload;
            const isLoading =
              !DEV_PREVIEW_RESULT && (status === "loading" || gen.status === "master_running");
            const [rw, rh] = ratio.split(":").map(Number);
            const frameAspect = rw && rh ? `${rw} / ${rh}` : "1 / 1";
            // Placeholders (empty / loading) must fit the column so they never
            // trigger a scrollbar. Wrap them in a flex-1 box and drive the
            // aspect card by its limiting dimension (height for portrait, width
            // otherwise) so it scales down to "contain". The real result below
            // is left free to overflow → scroll when it's genuinely tall.
            const portrait = rh > rw;
            const fitStyle = { aspectRatio: frameAspect, ...(portrait ? { height: "100%" } : { width: "100%" }) };

            // 2. Loading — skeleton in the chosen aspect ratio
            if (isLoading) {
              return (
                <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                <div
                  className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted"
                  style={fitStyle}
                >
                  <div className="absolute inset-0 animate-pulse bg-muted" />
                  <div className="relative flex flex-col items-center gap-3 px-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-accent-green" />
                    <p className="text-sm font-medium text-foreground">Генерируем баннер…</p>
                    <p className="text-xs text-muted-foreground">
                      {genSeconds >= 40
                        ? `Занимает дольше обычного… ${genSeconds} с`
                        : `Обычно занимает 10–30 секунд · ${genSeconds} с`}
                    </p>
                    <button
                      type="button"
                      onClick={cancelMaster}
                      className="mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:w-full"
                    >
                      <X className="h-4 w-4" />
                      Отменить
                    </button>
                  </div>
                </div>
                </div>
              );
            }

            // Error — classified message with retry (or top-up) action.
            // gen.runMaster reports failures via gen.status/gen.errorMsg (fresh
            // at render), so check both the local status and the context status.
            if (status === "error" || gen.status === "error") {
              return (
                <GenerationErrorCard
                  message={errorMsg || gen.errorMsg}
                  onRetry={onGenerate}
                  onDismiss={reset}
                />
              );
            }

            // 3 & 4. Result — banner + approve/regenerate, resize appears after approve
            if (imageUrl) {
              return (
                <div className="flex flex-col gap-6">
                  <div
                    className="group relative w-full overflow-hidden rounded-2xl border border-border bg-card"
                    title="Кликните для увеличения"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setZoomSrc(imageUrl);
                        setZoomOpen(true);
                      }}
                      className="flex w-full justify-center"
                    >
                      <img
                        src={imageUrl}
                        alt="Сгенерированный баннер"
                        className="max-h-[360px] w-auto max-w-full cursor-zoom-in object-contain transition group-hover:opacity-90"
                      />
                    </button>
                    {/* Overlay controls, top-right over the image: round dark
                        translucent Download + "⋯" menu (reference-styled). */}
                    <div className="absolute right-2 top-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          downloadAsJpg(imageUrl, `banner-${Date.now()}.jpg`);
                          toast.success("Баннер скачан");
                        }}
                        aria-label="Скачать"
                        title="Скачать"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 max-sm:h-11 max-sm:w-11"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Ещё"
                            title="Ещё"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 max-sm:h-11 max-sm:w-11"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          className="w-56 rounded-xl border-border bg-popover p-1.5 text-foreground"
                        >
                          <DropdownMenuItem
                            onClick={() => {
                              setZoomSrc(imageUrl);
                              setZoomOpen(true);
                            }}
                            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground"
                          >
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                            Открыть
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!(await confirm({ title: "Перегенерировать?", body: "Текущий баннер будет заменён.", confirmLabel: "Перегенерировать" }))) return;
                              void onGenerate();
                            }}
                            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground"
                          >
                            <RefreshCw className="h-4 w-4 text-muted-foreground" />
                            Перегенерировать
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              // Hand off the shared brand data to the landing
                              // generator so the user doesn't re-enter it.
                              try {
                                window.localStorage.setItem(
                                  "dw:landingSeed",
                                  JSON.stringify({
                                    brand_name: brandName,
                                    brand_logo: brandLogo,
                                    subject: isSlotPreset ? slotName : prompt,
                                    language,
                                    banner_text: bannerTextEnabled ? bannerText : "",
                                    // From-banner flow: inherit the vertical and flag the
                                    // handoff. The banner image itself is read live from the
                                    // generation context on the landing side (avoids the
                                    // localStorage quota risk of storing a full image here).
                                    vertical: bannerPresetToVertical(preset),
                                    from_banner: true,
                                  }),
                                );
                              } catch {
                                /* quota — landing just opens empty */
                              }
                              router.push("/landing");
                            }}
                            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground"
                          >
                            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                            Создать лендинг на основе этого
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            onClick={() => {
                              downloadAsJpg(imageUrl, `banner-${Date.now()}.jpg`);
                              toast.success("Баннер скачан");
                            }}
                            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground"
                          >
                            <Download className="h-4 w-4 text-muted-foreground" />
                            Скачать
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!(await confirm({ title: "Удалить баннер?", body: "Действие необратимо.", destructive: true, confirmLabel: "Удалить" }))) return;
                              gen.clear();
                              setStatus("idle");
                              // Also drop the history link so the "Загружено из
                              // истории" banner doesn't linger over an empty
                              // editor, pointing at a banner that's gone.
                              setLoadedCardId(null);
                              setLoadedCardName(null);
                              setLoadedFromPreset(null);
                              toast("Баннер удалён");
                            }}
                            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[color:var(--status-error)] focus:bg-[color:var(--status-error)]/10 focus:text-[color:var(--status-error)]"
                          >
                            <Trash2 className="h-4 w-4" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Direct step: the resize picker's own secondary button
                      opens the modal in one click — no intermediate screen.
                      Keep it mounted across a master regeneration (when
                      lastPayload/imageUrl briefly go null but gen.isBusy is
                      true) so the user's format selection isn't discarded. */}
                  {lastPayload || hasBanner || gen.isBusy ? (
                    <ResizeBatchPanel
                      disabled={gen.isBusy}
                      masterRatio={lastMasterRatio}
                      onLaunch={onLaunchBatch}
                      tiles={gen.tiles}
                      batchStatus={gen.status}
                      onRegenerateTile={gen.regenerateTile}
                      onRemoveTile={gen.removeTile}
                      onCancel={gen.cancel}
                    />
                  ) : null}
                </div>
              );
            }

            // 1. Empty state (idle) — a banner-shaped skeleton (in the chosen
            // aspect ratio) so the user sees where the result will appear.
            return (
              <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                <div
                  className="flex max-h-full max-w-full items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6"
                  style={fitStyle}
                >
                <div className="flex max-w-xs flex-col items-center gap-6 text-center">
                  <ImageIcon className="h-20 w-20 text-brand-violet/35" strokeWidth={1.5} />
                  <div className="space-y-1">
                    <h2 className="ds-h4">Здесь появится ваш баннер</h2>
                    <p className="ds-caption">
                      Заполните настройки, чтобы сгенерировать баннер.
                    </p>
                  </div>
                </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {zoomOpen && zoomSrc && (
        <FullscreenImageModal src={zoomSrc} onClose={() => setZoomOpen(false)} />
      )}
    </div>
  );
}

function OptionalField({
  label,
  enabled,
  onToggle,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="ds-h4">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] ${
            enabled ? "bg-accent-green" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${
              enabled ? "translate-x-4 bg-[color:var(--text-on-accent)]" : "translate-x-0 bg-white"
            }`}
          />
        </button>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!enabled}
        maxLength={maxLength}
        className="w-full h-12 rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green disabled:opacity-40"
        placeholder={placeholder}
      />
    </div>
  );
}

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        enabled ? "bg-accent-green" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform ${
          enabled ? "translate-x-4 bg-[color:var(--text-on-accent)]" : "translate-x-0 bg-white"
        }`}
      />
    </button>
  );
}

function SlotUpload({
  label,
  value,
  onClear,
  onPick,
  inputRef,
  onFile,
  aspect,
}: {
  label: string;
  value: string;
  onClear: () => void;
  onPick: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File | null) => void;
  aspect: "rect" | "square";
}) {
  const aspectClass = aspect === "rect" ? "aspect-video" : "aspect-square";
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-foreground/70">{label}</p>
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt={label}
            className={`${aspectClass} w-full rounded-md border border-border bg-black object-contain`}
          />
          <button
            type="button"
            onClick={onClear}
            aria-label="Удалить"
            className="absolute -right-2 -top-2 rounded-full bg-foreground p-0.5 text-background hover:opacity-80"
          >
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className={`${aspectClass} flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-[11px] text-foreground/50 hover:border-foreground/40 hover:text-foreground/80`}
        >
          <Upload size={16} />
          Загрузить
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function UsageStrip({ usage }: { usage: UsageInfo }) {
  const fmt = (n: number | null | undefined) =>
    typeof n === "number" ? n.toLocaleString("ru-RU") : "—";
  const qLabel = usage.quality.charAt(0).toUpperCase() + usage.quality.slice(1);
  const timeLabel =
    typeof usage.elapsed_ms === "number" ? `${(usage.elapsed_ms / 1000).toFixed(1)}с` : "—";
  if (usage.provider === "openai") {
    const inTxt = usage.input_text_tokens ?? 0;
    const inImg = usage.input_image_tokens ?? 0;
    const outImg = usage.output_image_tokens ?? 0;
    const total = usage.total_tokens ?? inTxt + inImg + outImg;
    const cost = typeof usage.cost_usd === "number" ? `≈ $${usage.cost_usd.toFixed(4)}` : "—";
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-3 pt-2 text-[10px] text-foreground/45">
        <span>{qLabel}</span>
        <span>·</span>
        <span>{timeLabel}</span>
        <span>·</span>
        <span>
          токены: <span className="text-foreground/55">{fmt(total)}</span>{" "}
          <span>
            (txt {fmt(inTxt)} + img {fmt(inImg)} + out {fmt(outImg)})
          </span>
        </span>
        <span>·</span>
        <span>{cost}</span>
        <span className="ml-auto">{usage.model}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-3 pt-2 text-[10px] text-foreground/45">
      <span>{qLabel}</span>
      <span>·</span>
      <span>{timeLabel}</span>
      <span>·</span>
      <span>
        токены: <span className="text-foreground/55">{fmt(usage.total_tokens)}</span>{" "}
        <span>
          (prompt {fmt(usage.prompt_tokens)} + out {fmt(usage.completion_tokens)})
        </span>
      </span>
      <span>·</span>
      <span>{usage.note ?? "Lovable AI"}</span>
      <span className="ml-auto">{usage.model}</span>
    </div>
  );
}
