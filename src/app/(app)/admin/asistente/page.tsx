import { getTranslations } from "next-intl/server";

import { AssistantBuilder, type AssistantProposalItem } from "@/components/app/assistant-builder";
import { PageHeader } from "@/components/app/page-header";
import { evaluationProposalSchema } from "@/lib/ai/evaluation-proposal";
import { aiConfigured } from "@/lib/ai/models";
import { getSession } from "@/lib/app/session";

export default async function AssistantPage() {
  const { supabase, event } = await getSession();
  const t = await getTranslations("assistantPage");
  const { data } = await supabase
    .from("assistant_proposals")
    .select("id, prompt, reply, proposal, status, created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const items: AssistantProposalItem[] = (data ?? []).map((item) => {
    const proposal = evaluationProposalSchema.safeParse(item.proposal);
    return {
      id: item.id,
      prompt: item.prompt,
      reply: item.reply,
      proposal: proposal.success ? proposal.data : null,
      status: item.status as AssistantProposalItem["status"],
      createdAt: item.created_at,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
    <AssistantBuilder
      configured={aiConfigured()}
      initialItems={items}
    />
    </div>
  );
}

