"use client";

// Генератор плейблов — только премиум-сцены. Слева шаблоны (как у баннеров),
// справа редактор сцены с превью. На телефоне — две вкладки: шаблоны и
// редактор. Что открыто, помнит метка dw_playable_pick; из каталога приходят
// с ?pick=<id>. В режиме landing те же сцены собираются в лендинг (сцена
// первым экраном, блоки под ней) — /landing/scene.
import { useEffect, useState } from "react";

import { getBrandSettings } from "@/components/SettingsDrawer";
import { ToolCoachmark } from "@/components/ToolCoachmark";
import { PlayableTemplateSidebar } from "@/components/playable/PlayableTemplateSidebar";
import { SceneStudio, type StudioMode } from "@/components/playable/SceneStudio";
import { DEFAULT_PLAYABLE_PICK, PLAYABLE_CATALOG_BY_ID, PLAYABLE_PICK_KEY } from "@/lib/playableCatalog";

/** Что открыто в редакторе лендинга на сцене — своя метка, не путается с плейблами. */
export const LANDING_SCENE_PICK_KEY = "dw_landing_scene_pick";

export function PlayableApp({ mode = "playable" }: { mode?: StudioMode }) {
  const pickKey = mode === "landing" ? LANDING_SCENE_PICK_KEY : PLAYABLE_PICK_KEY;
  const [pick, setPickState] = useState(DEFAULT_PLAYABLE_PICK);
  const [mobileTab, setMobileTab] = useState<"templates" | "editor">("templates");
  const [brand, setBrand] = useState({ name: "", logo: "" });

  useEffect(() => {
    const b = getBrandSettings();
    setBrand({ name: b.brand_name, logo: b.brand_logo });
    const fromUrl = new URLSearchParams(window.location.search).get("pick");
    if (fromUrl && PLAYABLE_CATALOG_BY_ID.has(fromUrl)) {
      setPick(fromUrl);
      setMobileTab("editor");
      const url = new URL(window.location.href);
      url.searchParams.delete("pick");
      window.history.replaceState(null, "", url.toString());
      return;
    }
    try {
      const stored = window.localStorage.getItem(pickKey) ?? "";
      if (PLAYABLE_CATALOG_BY_ID.has(stored)) setPickState(stored);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPick(id: string) {
    setPickState(id);
    try {
      window.localStorage.setItem(pickKey, id);
    } catch {
      /* ignore */
    }
  }

  const item = PLAYABLE_CATALOG_BY_ID.get(pick) ?? PLAYABLE_CATALOG_BY_ID.get(DEFAULT_PLAYABLE_PICK)!;

  return (
    <div className="bg-background text-foreground">
      <ToolCoachmark section={mode === "landing" ? "landing" : "playable"} />
      <div className="flex flex-col p-0 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-3">
        <h1 className="sr-only">{mode === "landing" ? "Лендинг на премиум-сцене" : "Плейбл-реклама"}</h1>
        <div className={`lg:contents ${mobileTab !== "templates" ? "max-lg:hidden" : ""}`}>
          <PlayableTemplateSidebar
            backHref={mode === "landing" ? "/landing" : undefined}
            value={item.id}
            onPick={(id) => {
              setPick(id);
              setMobileTab("editor");
            }}
          />
        </div>
        <SceneStudio
          scene={item.scene}
          brandName={brand.name}
          brandLogo={brand.logo}
          hiddenOnMobile={mobileTab === "templates"}
          mode={mode}
          onBack={() => setMobileTab("templates")}
        />
      </div>
    </div>
  );
}
