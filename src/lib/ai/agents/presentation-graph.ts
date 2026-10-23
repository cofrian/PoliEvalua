import "server-only";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import type { z } from "zod";

import {
  juryEvidenceSchema,
  juryQuestionsSchema,
  juryWeaknessesSchema,
  presentationInsightsSchema,
  type CriterionEvidence,
  type JuryWeakness,
  type JuryReport,
  type PresentationInsights,
} from "@/lib/ai/presentation-insights";
import {
  AGENT_TASKS,
  systemPrompt,
  type SpaceKind,
} from "@/lib/ai/prompts/presentation";
import {
  jsonInstruction,
  NVIDIA_BASE_URL,
  NVIDIA_NO_THINKING,
  withModelFallback,
} from "@/lib/ai/models";

// Agentes que analizan la transcripción COMPLETA de una exposición. Seis
// especialistas trabajan en paralelo y un revisor descarta cualquier cita que
// no aparezca literalmente en el texto. Nunca puntúan ni deciden ganadores.

const summarySchema = presentationInsightsSchema.pick({ summary: true, keyPoints: true });
const outlineSchema = presentationInsightsSchema.pick({ outline: true, actionItems: true });
const mindMapSchema = presentationInsightsSchema.pick({ mindMap: true });

type Summary = z.infer<typeof summarySchema>;
type Outline = z.infer<typeof outlineSchema>;
type MindMap = z.infer<typeof mindMapSchema>;
type Evidence = z.infer<typeof juryEvidenceSchema>;
type Questions = z.infer<typeof juryQuestionsSchema>;
type Weaknesses = z.infer<typeof juryWeaknessesSchema>;

export type AnalysisNode =
  | "summary"
  | "outline"
  | "mindMap"
  | "evidence"
  | "questions"
  | "weaknesses";

export type AnalysisState = Partial<{
  /** Versión de los prompts con la que se guardaron los nodos. */
  promptVersion: string;
  summary: Summary;
  outline: Outline;
  mindMap: MindMap;
  evidence: Evidence;
  questions: Questions;
  weaknesses: Weaknesses;
}>;

export type Criterion = {
  title: string;
  description: string | null;
  weight?: number | null;
  levels?: { score: number; label: string; descriptor: string | null }[];
};

/** La rúbrica completa (pesos y niveles) tal como la definió el espacio. */
function rubricText(criteria: Criterion[]) {
  return criteria
    .map((c, i) => {
      const head = `${i + 1}. ${c.title}${c.weight ? ` (peso ${c.weight})` : ""}${c.description ? ` — ${c.description}` : ""}`;
      const levels = (c.levels ?? [])
        .map((l) => `   - ${l.score} «${l.label}»${l.descriptor ? `: ${l.descriptor}` : ""}`)
        .join("\n");
      return levels ? `${head}\n   Niveles:\n${levels}` : head;
    })
    .join("\n");
}

export type GraphDependencies = {
  /** Espera turno en el limitador global de NVIDIA. */
  acquireSlot: () => Promise<void>;
  /** Persiste el resultado de un agente para no repetirlo en un reintento. */
  saveNode: (node: AnalysisNode, value: unknown) => Promise<void>;
  /** Límite para no empezar un intento que no cabe en la función. */
  deadlineMs: number;
};

const GraphState = Annotation.Root({
  transcript: Annotation<string>,
  teamName: Annotation<string>,
  projectTitle: Annotation<string | null>,
  criteria: Annotation<Criterion[]>,
  kind: Annotation<SpaceKind>,
  instructions: Annotation<string>,
  summary: Annotation<Summary | undefined>,
  outline: Annotation<Outline | undefined>,
  mindMap: Annotation<MindMap | undefined>,
  evidence: Annotation<Evidence | undefined>,
  questions: Annotation<Questions | undefined>,
  weaknesses: Annotation<Weaknesses | undefined>,
  review: Annotation<{ removedQuotes: number } | undefined>,
});

type State = typeof GraphState.State;

function model(modelId: string) {
  return new ChatOpenAI({
    model: modelId,
    apiKey: process.env.NVIDIA_API_KEY,
    temperature: 0.15,
    maxTokens: 3000,
    maxRetries: 0,
    modelKwargs: NVIDIA_NO_THINKING,
    configuration: { baseURL: NVIDIA_BASE_URL },
  });
}

function context(state: State) {
  return `Equipo o proyecto: ${state.teamName}
Título: ${state.projectTitle ?? "Sin título"}

Transcripción completa:
"""
${state.transcript}
"""`;
}

function normalize(text: string) {
  return text
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** El revisor: una cita solo vale si aparece de verdad en la transcripción. */
export function verifyEvidence(transcript: string, criteria: CriterionEvidence[]) {
  const haystack = normalize(transcript);
  let removed = 0;
  const verified = criteria.map((item) => {
    const evidence = item.evidence.filter((entry) => {
      const found = haystack.includes(normalize(entry.quote));
      if (!found) removed += 1;
      return found;
    });
    return {
      ...item,
      evidence,
      coverage: evidence.length === 0 ? ("absent" as const) : item.coverage,
    };
  });
  return { criteria: verified, removed };
}

/** Una cita de punto débil que no aparece en el texto se quita (el punto queda, sin cita). */
export function verifyWeaknesses(transcript: string, weaknesses: JuryWeakness[]) {
  const haystack = normalize(transcript);
  let removed = 0;
  const verified = weaknesses.map((item) => {
    if (item.quote && !haystack.includes(normalize(item.quote))) {
      removed += 1;
      return { ...item, quote: null };
    }
    return item;
  });
  return { weaknesses: verified, removed };
}

export async function runPresentationGraph({
  transcript,
  teamName,
  projectTitle,
  criteria,
  kind,
  instructions,
  previous,
  deps,
}: {
  transcript: string;
  teamName: string;
  projectTitle: string | null;
  criteria: Criterion[];
  kind: SpaceKind;
  /** Indicaciones ya limpias de la gestión del espacio ("" si no hay). */
  instructions: string;
  previous: AnalysisState;
  deps: GraphDependencies;
}): Promise<{
  insights: PresentationInsights;
  jury: JuryReport;
  removedQuotes: number;
  models: string[];
}> {
  const models = new Set<string>();
  // Cada agente reutiliza su resultado guardado si ya terminó en un intento
  // anterior, y si su modelo falla prueba el siguiente de la cadena.
  function agent<T extends Record<string, unknown>>(
    node: AnalysisNode,
    schema: z.ZodType<T>,
    task: (state: State) => string,
  ) {
    return async (state: State) => {
      const saved = previous[node];
      if (saved) return { [node]: saved };
      const { result, modelId: used } = await withModelFallback(
        "analysis",
        async (modelId, signal) => {
          await deps.acquireSlot();
          const output = await model(modelId)
            .withStructuredOutput(schema, { name: node, method: "jsonMode" })
            .invoke(
              [
                {
                  role: "system",
                  content: systemPrompt(state.kind, state.instructions, jsonInstruction(schema)),
                },
                { role: "user", content: `${task(state)}\n\n${context(state)}` },
              ],
              { signal },
            );
          return schema.parse(output);
        },
        { deadlineMs: deps.deadlineMs, attemptTimeoutMs: 120_000 },
      );
      models.add(used);
      await deps.saveNode(node, result);
      return { [node]: result };
    };
  }

  const graph = new StateGraph(GraphState)
    .addNode(
      "summaryAgent",
      agent("summary", summarySchema, () => AGENT_TASKS.summary),
    )
    .addNode(
      "outlineAgent",
      agent("outline", outlineSchema, () => AGENT_TASKS.outline),
    )
    .addNode(
      "mindMapAgent",
      agent("mindMap", mindMapSchema, () => AGENT_TASKS.mindMap),
    )
    .addNode(
      "evidenceAgent",
      agent("evidence", juryEvidenceSchema, (state) =>
        AGENT_TASKS.evidence(state.criteria.length ? rubricText(state.criteria) : ""),
      ),
    )
    .addNode(
      "questionsAgent",
      agent("questions", juryQuestionsSchema, () => AGENT_TASKS.questions),
    )
    .addNode(
      "weaknessesAgent",
      agent("weaknesses", juryWeaknessesSchema, (state) =>
        AGENT_TASKS.weaknesses(state.criteria.length ? rubricText(state.criteria) : ""),
      ),
    )
    .addNode("reviewer", async (state: State) => {
      const { criteria: verified, removed } = verifyEvidence(
        state.transcript,
        state.evidence?.criteria ?? [],
      );
      const weak = verifyWeaknesses(state.transcript, state.weaknesses?.weaknesses ?? []);
      return {
        evidence: { criteria: verified },
        weaknesses: { weaknesses: weak.weaknesses },
        review: { removedQuotes: removed + weak.removed },
      };
    })
    .addEdge(START, "summaryAgent")
    .addEdge(START, "outlineAgent")
    .addEdge(START, "mindMapAgent")
    .addEdge(START, "evidenceAgent")
    .addEdge(START, "questionsAgent")
    .addEdge(START, "weaknessesAgent")
    .addEdge(
      [
        "summaryAgent",
        "outlineAgent",
        "mindMapAgent",
        "evidenceAgent",
        "questionsAgent",
        "weaknessesAgent",
      ],
      "reviewer",
    )
    .addEdge("reviewer", END)
    .compile();

  const final = await graph.invoke({ transcript, teamName, projectTitle, criteria, kind, instructions });
  if (!final.summary || !final.outline || !final.mindMap || !final.questions) {
    throw new Error("Algún agente no devolvió resultado.");
  }

  return {
    insights: {
      summary: final.summary.summary,
      keyPoints: final.summary.keyPoints,
      outline: final.outline.outline,
      actionItems: final.outline.actionItems,
      mindMap: final.mindMap.mindMap,
    },
    jury: {
      criteria: final.evidence?.criteria ?? [],
      questions: final.questions.questions,
      risks: final.questions.risks,
      weaknesses: final.weaknesses?.weaknesses ?? [],
    },
    removedQuotes: final.review?.removedQuotes ?? 0,
    models: [...models],
  };
}
