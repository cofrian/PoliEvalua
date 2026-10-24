import { CheckCircle2, ClipboardList, UserPlus, Users, X } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/app/action-form";
import { hideWelcomeAction } from "@/app/(app)/admin/actions";
import { evaluationReadiness } from "@/lib/app/evaluation-readiness";
import type { getSession } from "@/lib/app/session";

type Session = Awaited<ReturnType<typeof getSession>>;

export const welcomeCookie = (eventId: string) => `welcome_hidden_${eventId.slice(0, 8)}`;

/**
 * Bienvenida para quien acaba de crear un espacio: los tres pasos sin los que
 * no se puede evaluar. Desaparece al completarlos o al cerrarla.
 */
export async function WelcomeGuide({ session }: { session: Session }) {
  const { supabase, event, words } = session;
  if ((await cookies()).get(welcomeCookie(event.id))) return null;

  const [readiness, { count: teams }, { count: evaluators }, t] = await Promise.all([
    evaluationReadiness(supabase, event.id),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase
      .from("event_members")
      .select("user_id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "active")
      .in("role", ["judge", "teacher", "reviewer"]),
    getTranslations("welcome"),
  ]);

  const steps = [
    {
      done: readiness.rubricReady,
      icon: ClipboardList,
      title: t("rubric"),
      text: t("rubricText"),
      href: "/rubrica",
      action: t("rubricAction"),
    },
    {
      done: (teams ?? 0) > 0,
      icon: Users,
      title: t("units", { units: words.unitsLower }),
      text: t("unitsText", { units: words.unitsLower }),
      href: "/admin/equipos",
      action: t("unitsAction"),
    },
    {
      done: (evaluators ?? 0) > 0,
      icon: UserPlus,
      title: t("people", { evaluator: words.evaluator }),
      text: t("peopleText"),
      href: "/admin/personas",
      action: t("peopleAction"),
    },
  ];
  if (steps.every((step) => step.done)) return null;

  return (
    <section aria-labelledby="welcome-title" className="relative rounded-2xl border border-upv-yellow/70 bg-upv-yellow/10 p-5 sm:p-6">
      <ActionForm action={hideWelcomeAction} className="absolute top-3 right-3">
        <button
          aria-label={t("hide")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("hide")}
          type="submit"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </ActionForm>
      <h2 className="font-display text-xl" id="welcome-title">
        {t("title")}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li className="flex flex-col rounded-xl border border-border bg-card p-4" key={step.href}>
            <div className="flex items-center gap-2">
              {step.done ? (
                <CheckCircle2 aria-label={t("done")} className="size-5 text-leaf-500 dark:text-green-400" />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                  {index + 1}
                </span>
              )}
              <step.icon aria-hidden="true" className="size-4 text-muted-foreground" />
              <h3 className="font-semibold">{step.title}</h3>
            </div>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{step.text}</p>
            {step.done ? (
              <p className="mt-3 text-sm font-semibold text-leaf-500 dark:text-green-400">{t("done")}</p>
            ) : (
              <Link className="mt-3 text-sm font-semibold underline underline-offset-4" href={step.href}>
                {step.action} →
              </Link>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        {t.rich("assistantHint", {
          link: (chunks) => (
            <Link className="font-semibold underline" href="/admin/asistente">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
