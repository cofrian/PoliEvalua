import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";
import { RecordingNoticeDialog } from "@/components/app/recording-notice-dialog";
import { SpaceSwitcher } from "@/components/app/space-switcher";
import { UpvBrand } from "@/components/brand/upv-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { peerReviewSettings } from "@/lib/app/peer-review";
import { NO_AUDIO_GUARANTEE, needsRecordingNotice } from "@/lib/app/recording-notice";
import { getSession, roleLabels } from "@/lib/app/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile, isAdmin, event, eventClosed, memberships, membership, recording, words, role, canVote } =
    await getSession();
  const showRecordingNotice = needsRecordingNotice(
    recording,
    membership.recording_notice_version,
  );
  const spaces = memberships.flatMap((membership) => {
    const relation = membership.events;
    const space = Array.isArray(relation) ? relation[0] : relation;
    return space ? [{ id: space.id, name: space.name }] : [];
  });

  // Presencia global y actividad del espacio, usadas para administración y
  // archivado seguro. Ninguna de las dos llamadas bloquea la navegación si falla.
  await Promise.all([
    supabase.rpc("touch_last_seen"),
    supabase.rpc("touch_event_activity", { target_event: event.id }),
  ]);

  const links = [
    { href: "/espacios", label: "Espacios" },
    ...(role === "student" ? [{ href: "/mi-grupo", label: `Mi ${words.unitLower}` }] : []),
    ...(role === "student" && peerReviewSettings(event.settings).enabled
      ? [{ href: "/coevaluacion", label: "Coevaluación" }]
      : []),
    { href: "/equipos", label: words.units },
    { href: "/agenda", label: "Agenda" },
    ...(canVote ? [{ href: "/sala", label: "Sala" }] : []),
    ...(words.hasModule("rubric") && (role !== "student" || words.studentsSeeRubric)
      ? [{ href: "/rubrica", label: "Rúbrica" }]
      : []),
    ...((isAdmin || eventClosed) && words.hasModule("results")
      ? [{ href: "/resultados", label: "Resultados" }]
      : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-svh bg-paper-50 text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur print:hidden dark:border-[#383C3D] dark:bg-[#1B1E1E]/95">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <UpvBrand className="shrink-0" href="/equipos" />
            <SpaceSwitcher
              current={{ id: event.id, name: event.name }}
              spaces={spaces}
            />
            <nav className="hidden gap-1 text-sm font-semibold sm:flex">
              {links.map((link) => (
                <Link
                  className="rounded-md px-2.5 py-1.5 hover:bg-upv-100 dark:hover:bg-white/10"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="flex items-center gap-2 rounded-full py-1 pr-1 hover:bg-upv-100 dark:hover:bg-white/10"
              href="/perfil"
              title="Mi perfil"
            >
              <span className="hidden text-sm font-medium md:inline">
                {profile.full_name}
              </span>
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Mi perfil"
                  className="size-8 rounded-full object-cover"
                  src={profile.avatar_url}
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-upv-blue text-xs font-bold text-upv-ink">
                  {profile.full_name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
            <Badge className="hidden sm:inline-flex" variant="secondary">
              {roleLabels[profile.role]}
            </Badge>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button className="h-9" type="submit" variant="outline">
                Salir
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 py-2 text-sm font-semibold sm:hidden">
          {links.map((link) => (
            <Link
              className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-upv-100 dark:hover:bg-white/10"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
      {showRecordingNotice ? (
        <RecordingNoticeDialog
          guarantee={recording.customText ? NO_AUDIO_GUARANTEE : null}
          spaceName={event.name}
          text={recording.noticeText}
        />
      ) : null}
    </div>
  );
}
