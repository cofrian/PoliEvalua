import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app/app-shell";
import { ProductTour, type TourKind } from "@/components/app/product-tour";
import { RecordingNoticeDialog } from "@/components/app/recording-notice-dialog";
import { buildNavigation } from "@/lib/app/navigation";
import { loadNotifications } from "@/lib/app/notifications";
import { needsRecordingNotice } from "@/lib/app/recording-notice";
import { getSession } from "@/lib/app/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const [tNav, tRoles, tNotice] = await Promise.all([
    getTranslations("nav"),
    getTranslations("roles"),
    getTranslations("recordingNotice"),
  ]);
  const { supabase, user, profile, event, memberships, membership, recording, words } = session;
  const tourKind: TourKind = session.isAdmin
    ? "admin"
    : profile.role === "student"
      ? "student"
      : session.canVote
        ? "judge"
        : "viewer";
  const tourSeen =
    Boolean((user.user_metadata?.tour_seen as Record<string, boolean> | undefined)?.[tourKind]) ||
    (await cookies()).has(`tour_seen_${tourKind}`);
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
  const [notices] = await Promise.all([
    loadNotifications(session),
    supabase.rpc("touch_last_seen"),
    supabase.rpc("touch_event_activity", { target_event: event.id }),
  ]);

  return (
    <>
      <AppShell
        current={{ id: event.id, name: event.name }}
        groups={buildNavigation(session, tNav)}
        notices={notices}
        profile={{
          name: profile.full_name,
          avatarUrl: profile.avatar_url,
          roleLabel: tRoles(profile.role),
        }}
        spaces={spaces}
      >
        {children}
      </AppShell>
      <ProductTour
        autoOpen={!tourSeen && !showRecordingNotice}
        evaluator={words.evaluator}
        kind={tourKind}
        spaceName={event.name}
        units={words.unitsLower}
      />
      {showRecordingNotice ? (
        <RecordingNoticeDialog
          guarantee={recording.customText ? tNotice("guarantee") : null}
          spaceName={event.name}
          text={recording.customText ?? tNotice("default", { months: recording.retentionMonths })}
        />
      ) : null}
    </>
  );
}
