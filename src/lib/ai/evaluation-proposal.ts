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

/** Crear grupos o equipos con sus integrantes (solo nombres; los correos se añaden después). */
export const groupsActionSchema = z.object({
  type: z.literal("groups"),
  groups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        projectTitle: z.string().trim().max(200).nullable(),
        members: z.array(z.string().trim().min(2).max(120)).max(20),
      }),
    )
    .min(1)
    .max(80),
});

/** Generar la agenda de exposiciones con los grupos que ya existen. */
export const agendaActionSchema = z.object({
  type: z.literal("agenda"),
  rooms: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  /** Hora de Valencia, «AAAA-MM-DDTHH:MM». */
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(1).max(240),
  gapMinutes: z.number().int().min(0).max(120),
  order: z.enum(["number", "random"]),
});

/** Un cambio del menú de gestión. Cada uno se aplica con la misma acción que su botón. */
export const settingsChangeSchema = z.discriminatedUnion("setting", [
  z.object({ setting: z.literal("recording"), enabled: z.boolean() }),
  z.object({ setting: z.literal("signup"), open: z.boolean() }),
  z.object({ setting: z.literal("status"), status: z.enum(["setup", "building", "judging", "closed"]) }),
  z.object({ setting: z.literal("name"), name: z.string().trim().min(3).max(100) }),
  z.object({ setting: z.literal("locale"), locale: z.enum(["es", "ca", "en"]) }),
  z.object({ setting: z.literal("participantMode"), mode: z.enum(["teams", "groups", "individuals", "candidates"]) }),
  z.object({ setting: z.literal("students"), showRubric: z.boolean().nullish(), publishResults: z.boolean().nullish() }),
  z.object({ setting: z.literal("publicVote"), open: z.boolean().nullish(), showResults: z.boolean().nullish(), title: z.string().trim().max(120).nullish() }),
  z.object({ setting: z.literal("turnReminder"), minutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]) }),
  z.object({ setting: z.literal("materials"), driveUrl: z.string().trim().max(2000).nullish(), instructions: z.string().trim().max(2000).nullish() }),
  z.object({ setting: z.literal("aiInstructions"), instructions: z.string().trim().max(2000) }),
  z.object({ setting: z.literal("challenge"), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).nullish() }),
  z.object({ setting: z.literal("invite"), email: z.string().trim().toLowerCase().email(), role: z.enum(["manager", "judge", "mentor", "student", "viewer"]) }),
  z.object({ setting: z.literal("joinCode"), role: z.enum(["judge", "mentor", "student", "viewer"]), enabled: z.boolean() }),
]);

export const settingsActionSchema = z.object({
  type: z.literal("settings"),
  changes: z.array(settingsChangeSchema).min(1).max(15),
});

export type SettingsChange = z.infer<typeof settingsChangeSchema>;

export const evaluationActionSchema = z.object({
  type: z.literal("evaluation"),
  proposal: evaluationProposalSchema,
});

export const assistantActionSchema = z.discriminatedUnion("type", [
  evaluationActionSchema,
  groupsActionSchema,
  agendaActionSchema,
  settingsActionSchema,
]);

/**
 * Borrador de agenda tal como lo devuelve el modelo: deja vacío lo que la
 * persona no ha dicho. El servidor comprueba lo imprescindible y pregunta.
 */
export const agendaDraftSchema = z.object({
  type: z.literal("agenda"),
  rooms: z.array(z.string().trim().min(1).max(80)).max(20).nullish(),
  start: z.string().nullish(),
  durationMinutes: z.number().int().min(1).max(240).nullish(),
  gapMinutes: z.number().int().min(0).max(120).nullish(),
  order: z.enum(["number", "random"]).nullish(),
});

const chatActionSchema = z.discriminatedUnion("type", [
  evaluationActionSchema,
  groupsActionSchema,
  agendaDraftSchema,
  settingsActionSchema,
]);

/** Lo que se le enseña al modelo como formato (sin las tolerancias de abajo). */
export const assistantChatPromptSchema = z.object({
  scope: z.enum(["space", "out_of_scope"]),
  /** Qué quiere hacer la persona, aunque todavía falten datos para la acción. */
  intent: z.enum(["evaluation", "groups", "agenda", "settings", "other"]),
  reply: z.string().trim().min(2).max(2000),
  questions: z.array(z.string().trim().min(3).max(300)).max(5),
  action: chatActionSchema.nullable(),
});

/**
 * Respuesta del asistente en una conversación. Quien decide si falta algo
 * imprescindible es el servidor (ver api/assistant), no el modelo.
 */
export const assistantChatSchema = z.object({
  scope: z.enum(["space", "out_of_scope"]),
  intent: z
    .enum(["evaluation", "groups", "agenda", "settings", "other"])
    .nullish()
    .catch(null)
    .transform((value) => value ?? "other"),
  reply: z.string().trim().min(2).max(2000),
  // Los modelos devuelven null en vez de [] cuando no preguntan nada.
  questions: z
    .array(z.string().trim().min(3).max(300))
    .max(5)
    .nullish()
    .transform((value) => value ?? []),
  // Una acción a medio rellenar o con otro tipo cuenta como «sin acción».
  action: z.preprocess((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const type = (raw as { type?: unknown }).type;
    // Algunos modelos copian la forma de la evaluación y anidan los datos de la
    // agenda o de los grupos en «proposal»: se suben al nivel de la acción.
    const nested = (raw as { proposal?: unknown }).proposal;
    const value =
      type !== "evaluation" && nested && typeof nested === "object" ? { ...nested, type } : raw;
    if (type === "evaluation") return value;
    if (type === "settings") {
      const changes = Array.isArray((value as { changes?: unknown }).changes) ? (value as { changes: unknown[] }).changes : [];
      const valid = changes.filter((change) => settingsChangeSchema.safeParse(change).success);
      return valid.length ? { type, changes: valid.slice(0, 15) } : null;
    }
    return chatActionSchema.safeParse(value).success ? value : null;
  }, chatActionSchema.nullable()),
});

export type AgendaDraft = z.infer<typeof agendaDraftSchema>;
export type EvaluationProposal = z.infer<typeof evaluationProposalSchema>;
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantChat = z.infer<typeof assistantChatSchema>;
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

