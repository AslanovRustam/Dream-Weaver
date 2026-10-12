"use client";

// Генератор плейблов — только премиум-сцены. Слева шаблоны (как у баннеров),
// справа редактор сцены с превью. На телефоне — две вкладки: шаблоны и
// редактор. Что открыто, помнит метка dw_playable_pick; из каталога приходят
// с ?pick=<id>.
import { useEffect, useState } from "react";

import { getBrandSettings } from "@/components/SettingsDrawer";
import { ToolCoachmark } from "@/components/ToolCoachmark";
import { PlayableTemplateSidebar } from "@/components/playable/PlayableTemplateSidebar";
import { SceneStudio } from "@/components/playable/SceneStudio";
import { DEFAULT_PLAYABLE_PICK, PLAYABLE_CATALOG_BY_ID, PLAYABLE_PICK_KEY } from "@/lib/playableCatalog";

export function PlayableApp() {
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
      const stored = window.localStorage.getItem(PLAYABLE_PICK_KEY) ?? "";
      if (PLAYABLE_CATALOG_BY_ID.has(stored)) setPickState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  function setPick(id: string) {
    setPickState(id);
    try {
      window.localStorage.setItem(PLAYABLE_PICK_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const item = PLAYABLE_CATALOG_BY_ID.get(pick) ?? PLAYABLE_CATALOG_BY_ID.get(DEFAULT_PLAYABLE_PICK)!;

  return (
    <div className="bg-background text-foreground">
      <ToolCoachmark section="playable" />
      <div className="flex flex-col p-0 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-3">
        <h1 className="sr-only">Плейбл-реклама</h1>
        <div className={`lg:contents ${mobileTab !== "templates" ? "max-lg:hidden" : ""}`}>
          <PlayableTemplateSidebar
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
          onBack={() => setMobileTab("templates")}
        />
      </div>
    </div>
  );
}
