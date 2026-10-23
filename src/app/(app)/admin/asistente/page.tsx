import { getTranslations } from "next-intl/server";

import { AssistantBuilder, type AssistantTurn } from "@/components/app/assistant-builder";
import { PageHeader } from "@/components/app/page-header";
import { assistantActionSchema, evaluationProposalSchema, type AssistantAction } from "@/lib/ai/evaluation-proposal";
import { aiConfigured } from "@/lib/ai/models";
import { getSession } from "@/lib/app/session";

/** Las propuestas antiguas guardaban la evaluación sin envoltorio. */
function parseAction(action: string, proposal: unknown): AssistantAction | null {
  if (!proposal || action === "none") return null;
  if (action === "evaluation" && typeof proposal === "object" && !("type" in proposal)) {
    const parsed = evaluationProposalSchema.safeParse(proposal);
    return parsed.success ? { type: "evaluation", proposal: parsed.data } : null;
  }
  const parsed = assistantActionSchema.safeParse(proposal);
  return parsed.success ? parsed.data : null;
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ hilo?: string; nuevo?: string }>;
}) {
  const { hilo, nuevo } = await searchParams;
  const { supabase, user, event } = await getSession();
  const t = await getTranslations("assistantPage");

  // Últimos mensajes de la persona para listar sus conversaciones.
  const { data: recent } = await supabase
    .from("assistant_proposals")
    .select("thread_id, prompt, created_at")
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const threads = new Map<string, { id: string; title: string; updatedAt: string }>();
  for (const row of recent ?? []) {
    const current = threads.get(row.thread_id);
    // Recorrido de lo más nuevo a lo más viejo: el título acaba siendo el primer mensaje.
    threads.set(row.thread_id, { id: row.thread_id, title: row.prompt, updatedAt: current?.updatedAt ?? row.created_at });
  }
  const threadList = [...threads.values()].slice(0, 12);
  const threadId = nuevo ? null : (hilo && threads.has(hilo) ? hilo : threadList[0]?.id ?? null);

  const { data } = threadId
    ? await supabase
        .from("assistant_proposals")
        .select("id, prompt, reply, questions, action, proposal, status, created_at")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .eq("thread_id", threadId)
        .order("created_at")
    : { data: [] };

  const turns: AssistantTurn[] = (data ?? []).map((item) => ({
    id: item.id,
    prompt: item.prompt,
    reply: item.reply,
    questions: (item.questions as string[] | null) ?? [],
    action: parseAction(item.action, item.proposal),
    status: item.status as AssistantTurn["status"],
    createdAt: item.created_at,
  }));

  return (
    <div className="space-y-6">
      <PageHeader description={t("description")} title={t("title")} />
      <AssistantBuilder
        configured={aiConfigured()}
        initialThreadId={threadId}
        initialTurns={turns}
        key={threadId ?? "nuevo"}
        threads={threadList}
      />
    </div>
  );
}
