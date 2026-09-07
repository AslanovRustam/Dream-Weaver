"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Coins,
  HelpCircle,
  Home,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";

import { SECTION_BY_ID } from "@/lib/sections";

// Collapsible left navigation for the Hub. Rail (64px) ↔ expanded (240px),
// toggled by a button and persisted. Grouped like Krea/Linear/Vercel side-nav;
// the active item uses the design-system lime "Active" pill (--lime-tint).
type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

// MVP: только эти разделы кликабельны. Остальное показываем серым «Скоро»
// (в неактивное попасть нельзя). Домой можно вернуться через логотип в шапке.
const ENABLED_HREFS = new Set<string>(["/", "/banner", "/landing"]);

const s = (id: Parameters<typeof SECTION_BY_ID.get>[0]) => {
  const sec = SECTION_BY_ID.get(id)!;
  return { href: sec.route, label: sec.title, icon: sec.icon };
};

const GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Главная", icon: Home, exact: true }] },
  {
    title: "Инструменты",
    items: [s("banner"), s("landing"), s("playable"), s("video"), s("email")],
  },
  {
    title: "Реклама",
    items: [s("ads"), s("stats"), s("mailing")],
  },
  {
    title: "Библиотека",
    items: [{ href: "/history", label: "История", icon: Clock }],
  },
];

const FOOTER: NavItem[] = [
  { href: "/settings", label: "Интеграции", icon: KeyRound },
  { href: "/help", label: "Помощь", icon: HelpCircle },
  { href: "/billing", label: "Тарифы", icon: Coins },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("dw_sidebar_collapsed") === "1");
    setReady(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem("dw_sidebar_collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/");

  // Render nothing until we know the persisted state, so the rail doesn't flip
  // width on first paint.
  if (!ready) {
    return <aside className="hidden w-60 shrink-0 lg:block" aria-hidden />;
  }

  return (
    <aside
      className={`sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-r border-border bg-panel transition-[width] duration-200 ease-out lg:flex ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Toggle */}
      <div className={`flex items-center px-3 pt-3 ${collapsed ? "justify-center" : "justify-end"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          title={collapsed ? "Развернуть" : "Свернуть"}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {GROUPS.map((g, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
            {g.title && !collapsed ? (
              <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-hint">
                {g.title}
              </p>
            ) : g.title && collapsed ? (
              <div className="mx-3 mb-1.5 h-px bg-border" />
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={!!isActive(item)}
                    collapsed={collapsed}
                    soon={!ENABLED_HREFS.has(item.href)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {FOOTER.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={!!isActive(item)} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  soon,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  soon?: boolean;
}) {
  const Icon = item.icon;

  // MVP: disabled ("Скоро") — greyed out, not a link, no navigation.
  if (soon) {
    return (
      <div
        aria-disabled="true"
        title={collapsed ? `${item.label} — скоро` : undefined}
        className={`group flex h-10 cursor-not-allowed items-center rounded-lg text-sm text-hint opacity-60 ${
          collapsed ? "justify-center px-0" : "gap-3 px-3"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed ? (
          <>
            <span className="truncate">{item.label}</span>
            <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-hint">
              Скоро
            </span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group flex h-10 items-center rounded-lg text-sm transition ${
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      } ${
        active
          ? "bg-[var(--lime-tint)] font-medium text-accent-green"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-accent-green" : ""}`} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}
