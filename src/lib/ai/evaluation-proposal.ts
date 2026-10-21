import { z } from "zod";

const requirementSchema = z.object({
  key: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(2).max(240),
  description: z.string().trim().max(1000).nullable(),
  required: z.boolean(),
});

const questionSchema = z.object({
  key: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(2).max(240),
  description: z.string().trim().max(1000).nullable(),
  type: z.enum(["text", "textarea", "boolean", "select"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(20),
});

const levelSchema = z.object({
  score: z.number().int().min(0).max(10),
  label: z.string().trim().min(1).max(100),
  descriptor: z.string().trim().min(1).max(1000),
});

const criterionSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable(),
  weight: z.number().positive().max(100),
  order: z.number().int().min(0).max(50),
  levels: z.array(levelSchema).min(2).max(11),
});

export const evaluationProposalSchema = z.object({
  evaluation: z.object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(2000).nullable(),
    instructions: z.string().trim().max(4000).nullable(),
    rubricName: z.string().trim().min(3).max(160),
    scaleMin: z.number().int().min(0).max(9),
    scaleMax: z.number().int().min(1).max(10),
    aggregationMethod: z.enum([
      "average",
      "consensus",
      "hybrid",
      "trimmed_mean",
    ]),
    minEvaluations: z.number().int().min(1).max(20),
    requirements: z.array(requirementSchema).max(30),
    questions: z.array(questionSchema).max(30),
    criteria: z.array(criterionSchema).min(1).max(20),
  }),
  academic: z
    .object({
      institution: z.string().trim().min(2).max(160),
      school: z.string().trim().max(160).nullable(),
      degree: z.string().trim().max(160).nullable(),
      subjectName: z.string().trim().min(2).max(160),
      subjectCode: z.string().trim().max(60).nullable(),
      academicYear: z.string().trim().max(40).nullable(),
      term: z.string().trim().max(80).nullable(),
    })
    .nullable(),
  jury: z.object({
    enabled: z.boolean(),
    panelNames: z.array(z.string().trim().min(2).max(100)).max(20),
    assignmentMode: z.enum(["manual", "balanced"]),
  }),
}).superRefine((proposal, context) => {
  if (proposal.evaluation.scaleMax <= proposal.evaluation.scaleMin) {
    context.addIssue({
      code: "custom",
      message: "La escala máxima debe ser mayor que la mínima.",
      path: ["evaluation", "scaleMax"],
    });
  }
});

export const assistantResponseSchema = z.object({
  scope: z.enum(["evaluation", "out_of_scope"]),
  reply: z.string().trim().min(2).max(2000),
  proposal: evaluationProposalSchema.nullable(),
});

export type EvaluationProposal = z.infer<typeof evaluationProposalSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

function safeKey(value: string | undefined, prefix: string, index: number) {
  const normalized = value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return normalized || `${prefix}-${index + 1}`;
}

export function normalizeEvaluationProposal(
  input: EvaluationProposal,
): EvaluationProposal {
  const criteria = input.evaluation.criteria.map((criterion, index) => {
    const supplied = new Map(
      [...criterion.levels]
        .filter(
          (level) =>
            level.score >= input.evaluation.scaleMin &&
            level.score <= input.evaluation.scaleMax,
        )
        .sort((a, b) => a.score - b.score)
        .map((level) => [level.score, level]),
    );
    const levels = Array.from(
      { length: input.evaluation.scaleMax - input.evaluation.scaleMin + 1 },
      (_, offset) => {
        const score = input.evaluation.scaleMin + offset;
        return supplied.get(score) ?? {
          score,
          label: `Nivel ${score}`,
          descriptor: `Desempeño correspondiente al nivel ${score} en ${criterion.title}.`,
        };
      },
    );
    return {
      ...criterion,
      order: index,
      weight: Number(criterion.weight),
      levels,
    };
  });

  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const normalizedCriteria = criteria.map((criterion) => ({
    ...criterion,
    weight: Number(((criterion.weight / total) * 100).toFixed(2)),
  }));
  const normalizedTotal = normalizedCriteria.reduce(
    (sum, criterion) => sum + criterion.weight,
    0,
  );
  normalizedCriteria[normalizedCriteria.length - 1].weight = Number(
    (
      normalizedCriteria[normalizedCriteria.length - 1].weight +
      (100 - normalizedTotal)
    ).toFixed(2),
  );

  const usedKeys = new Set<string>();
  const uniqueKey = (candidate: string) => {
    let key = candidate;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${candidate}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return key;
  };

  return {
    ...input,
    evaluation: {
      ...input.evaluation,
      requirements: input.evaluation.requirements.map((requirement, index) => ({
        ...requirement,
        key: uniqueKey(safeKey(requirement.key ?? requirement.label, "requisito", index)),
      })),
      questions: input.evaluation.questions.map((question, index) => ({
        ...question,
        key: uniqueKey(safeKey(question.key ?? question.label, "pregunta", index)),
        options: question.type === "select" ? question.options : [],
      })),
      criteria: normalizedCriteria,
    },
  };
}

