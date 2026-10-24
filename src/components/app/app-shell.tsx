"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  Flag,
  Gift,
  GraduationCap,
  House,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Mic,
  Monitor,
  Moon,
  QrCode,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { OPEN_TOUR_EVENT } from "@/components/app/product-tour";
import { SpaceSwitcher, type SpaceOption } from "@/components/app/space-switcher";
import { PoliBrand } from "@/components/brand/poli-brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavGroup, NavIcon, NavItem } from "@/lib/app/navigation";
import type { Notice } from "@/lib/app/notifications";
import { cn } from "@/lib/utils";

const icons: Record<NavIcon, LucideIcon> = {
  home: House,
  users: Users,
  calendar: CalendarDays,
  mic: Mic,
  list: ListChecks,
  chart: BarChart3,
  star: Star,
  settings: Settings,
  "user-plus": UserPlus,
  sparkles: Sparkles,
  clipboard: ClipboardCheck,
  layers: Layers,
  video: Video,
  qr: QrCode,
  graduation: GraduationCap,
  flag: Flag,
  gift: Gift,
  shield: ShieldCheck,
  group: UsersRound,
};

export type Profile = { name: string; avatarUrl: string | null; roleLabel: string };

function matches(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Una sección está activa si lo está su página o cualquiera de sus pestañas. */
function isActive(pathname: string, item: NavItem | string) {
  if (typeof item === "string") return matches(pathname, item);
  return matches(pathname, item.href) || (item.tabs ?? []).some((tab) => matches(pathname, tab.href));
}

/** Pestañas de la sección actual, encima del contenido. */
function SectionTabs({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const section = groups.flatMap((group) => group.items).find((item) => item.tabs?.length && isActive(pathname, item));
  if (!section?.tabs || section.tabs.length < 2) return null;
  // La pestaña más concreta que coincide (p. ej. /equipos/123 → «Ver grupos»).
  const current = [...section.tabs]
    .filter((tab) => matches(pathname, tab.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav aria-label={t("sections")} className="-mx-4 mb-6 overflow-x-auto px-4 print:hidden sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {section.tabs.map((tab) => {
          const active = tab.href === current?.href;
          return (
            <li key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
                href={tab.href}
                title={tab.hint}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const Icon = icons[item.icon];
  const active = isActive(pathname, item);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-upv-yellow/25 text-foreground hover:bg-upv-yellow/30 dark:bg-upv-yellow/15",
      )}
      href={item.href}
      onClick={onNavigate}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", active ? "text-foreground" : "opacity-70 group-hover:opacity-100")}
      />
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {item.hint ? (
          // Solo visual: el nombre del enlace sigue siendo el de la sección.
          <span aria-hidden="true" className="block text-xs leading-snug font-normal text-muted-foreground first-letter:uppercase">
            {item.hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function NavGroups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("main")} className="space-y-6">
      {groups.map((group, index) => (
        <div className="space-y-1" key={group.label ?? index}>
          {group.label ? (
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => (
            <NavLink item={item} key={item.href} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Avatar({ profile, className }: { profile: Profile; className?: string }) {
  return profile.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className={cn("size-8 rounded-full object-cover", className)} src={profile.avatarUrl} />
  ) : (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-upv-blue text-xs font-bold text-upv-ink",
        className,
      )}
    >
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function UserMenu({ profile }: { profile: Profile }) {
  const { setTheme, theme } = useTheme();
  const t = useTranslations("userMenu");
  const tTour = useTranslations("tour");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-muted sm:pr-3">
        {/* El nombre accesible incluye el texto visible (WCAG 2.5.3). */}
        <span className="sr-only">{t("open")}</span>
        <Avatar profile={profile} />
        <span className="hidden max-w-40 text-left leading-tight sm:block">
          <span className="block truncate text-sm font-medium">{profile.name}</span>
          <span className="block text-xs text-muted-foreground">{profile.roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-semibold">{profile.name}</span>
          <span className="text-xs text-muted-foreground">{profile.roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <UserRound aria-hidden="true" className="size-4" /> {t("profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))}>
          <GraduationCap aria-hidden="true" className="size-4" /> {tTour("replay")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("theme")}</DropdownMenuLabel>
        {(
          [
            ["light", t("light"), Sun],
            ["dark", t("dark"), Moon],
            ["system", t("system"), Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon aria-hidden="true" className="size-4" /> {label}
            {theme === value ? <span className="ml-auto text-xs text-muted-foreground">✓</span> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button className="w-full" type="submit">
              <LogOut aria-hidden="true" className="size-4" /> {t("logout")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Campana con lo pendiente; cada aviso lleva a donde se resuelve. */
export function NotificationBell({ notices }: { notices: Notice[] }) {
  const t = useTranslations("notifications");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={notices.length ? t("openCount", { count: notices.length }) : t("open")}
        className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell aria-hidden="true" className="size-5" />
        {notices.length ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white"
          >
            {notices.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notices.length ? (
          notices.map((notice, index) => (
            <DropdownMenuItem asChild key={`${notice.kind}-${index}`}>
              <Link className="whitespace-normal" href={notice.href}>
                {notice.kind === "turn"
                  ? t("turn", { team: notice.team, minutes: notice.minutes })
                  : notice.kind === "live"
                    ? t("live", { team: notice.team })
                    : t(notice.kind, { count: notice.count })}
              </Link>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Marco de la aplicación: barra lateral con el menú del rol en escritorio y,
 * en el móvil, barra inferior con lo principal más un panel con el resto.
 */
export function AppShell({
  groups,
  current,
  spaces,
  profile,
  notices,
  children,
}: {
  groups: NavGroup[];
  notices: Notice[];
  current: SpaceOption;
  spaces: SpaceOption[];
  profile: Profile;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const primary = groups.flatMap((group) => group.items).filter((item) => item.primary).slice(0, 4);
  const moreActive = !primary.some((item) => isActive(pathname, item));

  return (
    <div className="min-h-svh bg-background text-foreground lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        className="sr-only z-50 rounded-md bg-card px-4 py-2 font-semibold shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#contenido"
      >
        {t("skip")}
      </a>
      <div className="hidden border-r border-border/70 bg-card/60 print:hidden lg:block">
      <aside className="sticky top-0 flex h-svh flex-col">
        <div className="flex h-16 items-center px-4">
          <PoliBrand compact href="/equipos" />
        </div>
        <div className="px-3 pb-4">
          <SpaceSwitcher className="w-full max-w-none sm:max-w-none" current={current} spaces={spaces} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavGroups groups={groups} />
        </div>
      </aside>
      </div>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur print:hidden">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
              <Link className="shrink-0 font-heading text-base font-bold" href="/equipos">
                Evalúa
              </Link>
              <SpaceSwitcher className="min-w-0 max-w-none flex-1 sm:max-w-64 sm:flex-none" current={current} spaces={spaces} />
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-1">
              <NotificationBell notices={notices} />
              <UserMenu profile={profile} />
            </div>
          </div>
        </header>

        <main
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pb-12"
          id="contenido"
          tabIndex={-1}
        >
          <SectionTabs groups={groups} />
          {children}
        </main>
      </div>

      <nav
        aria-label={t("quick")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:hidden"
      >
        <ul
          className="mx-auto grid max-w-md"
          style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
        >
          {primary.map((item) => {
            const Icon = icons[item.icon];
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
                    active && "text-foreground",
                  )}
                  href={item.href}
                >
                  <span className={cn("rounded-full px-4 py-1", active && "bg-upv-yellow/30 dark:bg-upv-yellow/20")}>
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <Sheet onOpenChange={setOpen} open={open}>
              <SheetTrigger
                className={cn(
                  "flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
                  moreActive && "text-foreground",
                )}
              >
                <span className={cn("rounded-full px-4 py-1", moreActive && "bg-upv-yellow/30 dark:bg-upv-yellow/20")}>
                  <Menu aria-hidden="true" className="size-5" />
                </span>
                {t("more")}
              </SheetTrigger>
              <SheetContent className="w-[85vw] max-w-sm overflow-y-auto p-4" side="left">
                <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
                <div className="mb-4 pt-2">
                  <PoliBrand compact href="/equipos" />
                </div>
                <NavGroups groups={groups} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </div>
  );
}
