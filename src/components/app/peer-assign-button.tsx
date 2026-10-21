"use client";

import { useActionState } from "react";

import { generatePeerAssignmentsAction, type PeerAssignState } from "@/app/(app)/admin/actions";
import { SubmitButton } from "@/components/auth/submit-button";

export function PeerAssignButton({ hasAssignments }: { hasAssignments: boolean }) {
  const [state, formAction] = useActionState<PeerAssignState, FormData>(generatePeerAssignmentsAction, null);
  return (
    <form action={formAction} className="space-y-2">
      <div className="max-w-xs">
        <SubmitButton
          idleLabel={hasAssignments ? "Repartir de nuevo" : "Repartir grupos a evaluar"}
          pendingLabel="Repartiendo…"
        />
      </div>
      {state ? (
        <p
          className={
            state.ok
              ? "rounded-lg border border-leaf-500/50 bg-leaf-500/10 px-3 py-2 text-sm"
              : "rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2 text-sm"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
