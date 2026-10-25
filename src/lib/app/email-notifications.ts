import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { isLocale, type Locale } from "@/i18n/config";
import { sendEmails, siteUrl, type Email } from "@/lib/email";

// Avisos por correo. Siempre con la clave de servicio: los correos de acceso
// solo se leen con notification_recipients(), que respeta la baja del perfil.

/** Minutos de antelación del aviso de turno que puede elegir la gestión. */
export const TURN_REMINDER_OPTIONS = [5, 10, 15, 30] as const;

export function turnReminderMinutes(settings: Record<string, unknown> | null) {
  const value = Number((settings?.notifications as { turn_minutes?: unknown } | undefined)?.turn_minutes);
  return (TURN_REMINDER_OPTIONS as readonly number[]).includes(value) ? value : 10;
}

type Recipient = { email: string; locale: Locale };

const localeOf = (value: unknown, fallback: Locale): Locale => (isLocale(value) ? value : fallback);

async function recipientsFor(admin: SupabaseClient, userIds: string[], fallback: Locale): Promise<Recipient[]> {
  if (!userIds.length) return [];
  const { data } = await admin.rpc("notification_recipients", { user_ids: userIds });
  return ((data ?? []) as { email: string; locale: string | null }[]).map((row) => ({
    email: row.email,
    locale: localeOf(row.locale, fallback),
  }));
}

/** Reserva la clave del aviso; false si ya se envió. */
async function claim(admin: SupabaseClient, key: string, eventId: string, kind: string) {
  const { error } = await admin.from("email_log").insert({ key, event_id: eventId, kind });
  return !error;
}

async function compose(recipients: Recipient[], build: (t: Awaited<ReturnType<typeof getTranslations>>, to: string) => Email) {
  const emails: Email[] = [];
  for (const recipient of recipients) {
    const t = await getTranslations({ locale: recipient.locale, namespace: "email" });
    emails.push(build(t, recipient.email));
  }
  return emails;
}

export async function sendInvitationEmail(input: {
  email: string;
  eventName: string;
  role: string;
  link: string;
  locale: Locale;
}) {
  const t = await getTranslations({ locale: input.locale, namespace: "email" });
  const tRoles = await getTranslations({ locale: input.locale, namespace: "roles" });
  return sendEmails([
    {
      to: input.email,
      subject: t("invitation.subject", { event: input.eventName }),
      heading: t("invitation.heading", { event: input.eventName }),
      body: t("invitation.body", { event: input.eventName, role: tRoles(input.role as never) }),
      cta: { label: t("invitation.cta"), href: input.link },
      footer: t("footerInvite"),
      noReply: t("noReply"),
    },
  ]);
}

export async function sendPasswordResetEmail(input: { email: string; link: string; locale: Locale }) {
  const t = await getTranslations({ locale: input.locale, namespace: "email" });
  return sendEmails([
    {
      to: input.email,
      subject: t("reset.subject"),
      heading: t("reset.heading"),
      body: t("reset.body"),
      cta: { label: t("reset.cta"), href: input.link },
      footer: t("reset.footer"),
      noReply: t("noReply"),
    },
  ]);
}

/** Turnos que empiezan pronto: avisa a todo el equipo una sola vez. */
export async function sendTurnReminders(admin: SupabaseClient) {
  const { data: due } = await admin.rpc("due_turn_reminders", { max_rows: 50 });
  let sent = 0;
  for (const slot of (due ?? []) as { slot_id: string; event_id: string; team_id: string; starts_at: string }[]) {
    if (!(await claim(admin, `turn:${slot.slot_id}:${slot.starts_at}`, slot.event_id, "turn"))) continue;
    const [{ data: event }, { data: team }, { data: members }] = await Promise.all([
      admin.from("events").select("name, locale").eq("id", slot.event_id).single(),
      admin.from("teams").select("name").eq("id", slot.team_id).single(),
      admin.from("team_members").select("user_id, email").eq("team_id", slot.team_id),
    ]);
    if (!event || !team) continue;
    const fallback = localeOf(event.locale, "es");
    const withAccount = (members ?? []).filter((member) => member.user_id).map((member) => member.user_id as string);
    // Quien aún no tiene cuenta no puede darse de baja: se le avisa en el idioma del espacio.
    const withoutAccount = (members ?? [])
      .filter((member) => !member.user_id && member.email)
      .map((member) => ({ email: member.email as string, locale: fallback }));
    const recipients = [...(await recipientsFor(admin, withAccount, fallback)), ...withoutAccount];
    const minutes = Math.max(1, Math.round((new Date(slot.starts_at).getTime() - Date.now()) / 60_000));
    const emails = await compose(recipients, (t, to) => ({
      to,
      subject: t("turn.subject", { minutes, team: team.name }),
      heading: t("turn.heading", { minutes }),
      body: t("turn.body", { team: team.name, event: event.name, minutes }),
      cta: { label: t("turn.cta"), href: `${siteUrl()}/agenda` },
      footer: t("footer"),
      noReply: t("noReply"),
    }));
    sent += await sendEmails(emails);
  }
  return sent;
}

/** Resultados publicados para el alumnado: una vez por espacio. */
export async function sendResultsPublished(admin: SupabaseClient, eventId: string) {
  if (!(await claim(admin, `results:${eventId}`, eventId, "results"))) return 0;
  const [{ data: event }, { data: members }] = await Promise.all([
    admin.from("events").select("name, locale").eq("id", eventId).single(),
    admin.from("event_members").select("user_id").eq("event_id", eventId).eq("role", "student").eq("status", "active"),
  ]);
  if (!event) return 0;
  const fallback = localeOf(event.locale, "es");
  const recipients = await recipientsFor(admin, (members ?? []).map((member) => member.user_id), fallback);
  const emails = await compose(recipients, (t, to) => ({
    to,
    subject: t("results.subject", { event: event.name }),
    heading: t("results.heading"),
    body: t("results.body", { event: event.name }),
    cta: { label: t("results.cta"), href: `${siteUrl()}/mi-grupo` },
    footer: t("footer"),
    noReply: t("noReply"),
  }));
  return sendEmails(emails);
}
