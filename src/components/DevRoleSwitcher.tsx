"use client";

// DEV-ONLY role switcher. The local build has no backend, so there is no way to
// sign in as a guest / plain user / admin — this pins the role that lib/roles
// reports so all three scenarios can be exercised and reviewed.
//
// Rendered only when NEXT_PUBLIC_DEV_AUTH_BYPASS=true, i.e. never in production.
import { devRoleAvailable, setDevRole, useDevRole, type AppRole } from "@/lib/roles";

const OPTIONS: { id: AppRole; label: string }[] = [
  { id: "guest", label: "Гость" },
  { id: "user", label: "Пользователь" },
  { id: "admin", label: "Админ" },
];

export function DevRoleSwitcher() {
  const active = useDevRole();
  if (!devRoleAvailable()) return null;

  return (
    <div className="fixed bottom-3 left-3 z-[80] flex items-center gap-1 rounded-full border border-accent-green/40 bg-[#0a0a0a]/95 p-1 shadow-xl backdrop-blur">
      <span className="px-2 ds-micro uppercase tracking-wide text-muted-foreground">dev role</span>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setDevRole(active === o.id ? null : o.id)}
          className={`rounded-full px-2.5 py-1 ds-micro font-semibold transition ${
            active === o.id
              ? "bg-accent-green text-on-accent"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
