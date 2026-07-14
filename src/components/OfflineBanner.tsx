"use client";

// Thin top strip shown whenever the browser reports no internet connection.
// Mounted once globally (in Providers) so it covers every screen — editor,
// history, account, login — on both desktop and mobile. z-[90] keeps it above
// dialogs (z-50) and the fullscreen lightbox (z-80).
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!mounted || online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-[color:var(--status-error)] px-4 py-2 text-center text-sm font-medium text-white"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      Нет соединения с интернетом — некоторые действия могут не работать
    </div>
  );
}
