"use server";

import { getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

import { publicVoteSettings } from "@/lib/app/public-vote";
import { clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicVoteState = { ok: boolean; message: string; teamId?: string } | null;

/**
 * Registra (o cambia) el voto de este dispositivo. No hay cuenta: el
 * dispositivo se reconoce con una cookie aleatoria y solo se guarda su huella.
 */
export async function castPublicVoteAction(
  _previous: PublicVoteState,
  formData: FormData,
): Promise<PublicVoteState> {
  const parsed = z
    .object({ slug: z.string().min(3).max(60), teamId: z.string().uuid() })
    .safeParse({ slug: formData.get("slug"), teamId: formData.get("teamId") });
  const localeValue = formData.get("locale");
  const t = await getTranslations({ locale: isLocale(localeValue) ? localeValue : "es", namespace: "publicVote" });
  if (!parsed.success) return { ok: false, message: t("errors.choose") };

  const admin = createAdminClient();
  const ipKey = [`ip:${await clientIp()}`];
  if (await isBlocked(admin, "public_vote", ipKey)) {
    return { ok: false, message: t("errors.rate") };
  }
  await recordAttempt(admin, "public_vote", ipKey);

  const { data: event } = await admin
    .from("events")
    .select("id, settings")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (!event || !publicVoteSettings(event.settings).open) {
    return { ok: false, message: t("errors.closed") };
  }

  const { data: team } = await admin
    .from("teams")
    .select("id")
    .eq("id", parsed.data.teamId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (!team) return { ok: false, message: t("errors.gone") };

  const cookieStore = await cookies();
  const cookieName = `pv_${event.id.slice(0, 8)}`;
  let token = cookieStore.get(cookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    token = randomBytes(32).toString("base64url");
    cookieStore.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: `/votar/${parsed.data.slug}`,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  const voterHash = createHash("sha256").update(`${event.id}:${token}`).digest("hex");

  const { error } = await admin
    .from("public_votes")
    .upsert({ event_id: event.id, voter_hash: voterHash, team_id: team.id }, { onConflict: "event_id,voter_hash" });
  if (error) return { ok: false, message: t("errors.save") };

  return { ok: true, message: t("saved"), teamId: team.id };
}
