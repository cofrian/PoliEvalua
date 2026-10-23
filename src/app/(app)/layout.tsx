import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app/app-shell";
import { RecordingNoticeDialog } from "@/components/app/recording-notice-dialog";
import { buildNavigation } from "@/lib/app/navigation";
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
  const { supabase, profile, event, memberships, membership, recording } = session;
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

  return (
    <>
      <AppShell
        current={{ id: event.id, name: event.name }}
        groups={buildNavigation(session, tNav)}
        profile={{
          name: profile.full_name,
          avatarUrl: profile.avatar_url,
          roleLabel: tRoles(profile.role),
        }}
        spaces={spaces}
      >
        {children}
      </AppShell>
      {showRecordingNotice ? (
        <RecordingNoticeDialog
          guarantee={recording.customText ? tNotice("guarantee") : null}
          spaceName={event.name}
          text={recording.customText ?? tNotice("default")}
        />
      ) : null}
    </>
  );
}
