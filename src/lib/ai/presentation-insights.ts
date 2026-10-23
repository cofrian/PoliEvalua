import { z } from "zod";

export const presentationInsightsSchema = z.object({
  summary: z.string().trim().min(20).max(12000),
  keyPoints: z.array(z.string().trim().min(2).max(500)).min(1).max(12),
  outline: z
    .array(
      z.object({
        heading: z.string().trim().min(2).max(160),
        bullets: z.array(z.string().trim().min(2).max(500)).min(1).max(10),
      }),
    )
    .min(1)
    .max(12),
  actionItems: z.array(z.string().trim().min(2).max(500)).max(12),
  mindMap: z.object({
    title: z.string().trim().min(2).max(160),
    branches: z
      .array(
        z.object({
          title: z.string().trim().min(2).max(160),
          items: z.array(z.string().trim().min(2).max(300)).min(1).max(8),
        }),
      )
      .min(2)
      .max(8),
  }),
});

export type PresentationInsights = z.infer<typeof presentationInsightsSchema>;


export const criterionEvidenceSchema = z.object({
  criterion: z.string().trim().min(2).max(200),
  coverage: z.enum(["clear", "partial", "absent"]),
  evidence: z
    .array(
      z.object({
        quote: z.string().trim().min(3).max(600),
        explanation: z.string().trim().min(3).max(400),
      }),
    )
    .max(4),
});

export const juryEvidenceSchema = z.object({
  criteria: z.array(criterionEvidenceSchema).max(20),
});

export const juryQuestionsSchema = z.object({
  questions: z.array(z.string().trim().min(5).max(400)).min(1).max(8),
  risks: z.array(z.string().trim().min(5).max(400)).max(8),
});

export const juryWeaknessSchema = z.object({
  /** Criterio de la rúbrica, o «General» si no encaja en ninguno. */
  criterion: z.string().trim().min(2).max(200),
  weakness: z.string().trim().min(5).max(500),
  /** Cita literal que lo muestra; null si el punto débil es que no se trató. */
  quote: z.string().trim().min(3).max(600).nullable(),
  question: z.string().trim().min(5).max(400),
});

export const juryWeaknessesSchema = z.object({
  weaknesses: z.array(juryWeaknessSchema).max(16),
});

export type CriterionEvidence = z.infer<typeof criterionEvidenceSchema>;
export type JuryWeakness = z.infer<typeof juryWeaknessSchema>;
export type JuryReport = {
  criteria: CriterionEvidence[];
  questions: string[];
  risks: string[];
  weaknesses: JuryWeakness[];
};
