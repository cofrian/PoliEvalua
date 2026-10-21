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

