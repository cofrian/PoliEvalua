import { AssistantBuilder, type AssistantProposalItem } from "@/components/app/assistant-builder";
import { evaluationProposalSchema } from "@/lib/ai/evaluation-proposal";
import { getSession } from "@/lib/app/session";

export default async function AssistantPage() {
  const { supabase, event } = await getSession();
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
    <AssistantBuilder
      configured={Boolean(process.env.NVIDIA_API_KEY && process.env.NVIDIA_MODEL)}
      initialItems={items}
    />
  );
}

