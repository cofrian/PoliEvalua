import "server-only";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import type { z } from "zod";

import {
  juryEvidenceSchema,
  juryQuestionsSchema,
  presentationInsightsSchema,
  type CriterionEvidence,
  type JuryReport,
  type PresentationInsights,
} from "@/lib/ai/presentation-insights";
import { NVIDIA_BASE_URL, withModelFallback } from "@/lib/ai/models";

// Agentes que analizan la transcripción COMPLETA de una exposición. Cinco
// especialistas trabajan en paralelo y un revisor descarta cualquier cita que
// no aparezca literalmente en el texto. Nunca puntúan ni deciden ganadores.

const BASE_RULES = `Eres un asistente académico de la Universitat Politècnica de València.
Trabajas solo con la transcripción de una exposición oral; no inventes nada que no esté en ella.
Escribe en español claro y conserva los nombres técnicos tal como aparecen.
No evalúes, no asignes notas y no decidas ganadores.`;

const summarySchema = presentationInsightsSchema.pick({ summary: true, keyPoints: true });
const outlineSchema = presentationInsightsSchema.pick({ outline: true, actionItems: true });
const mindMapSchema = presentationInsightsSchema.pick({ mindMap: true });

type Summary = z.infer<typeof summarySchema>;
type Outline = z.infer<typeof outlineSchema>;
type MindMap = z.infer<typeof mindMapSchema>;
type Evidence = z.infer<typeof juryEvidenceSchema>;
type Questions = z.infer<typeof juryQuestionsSchema>;

export type AnalysisNode = "summary" | "outline" | "mindMap" | "evidence" | "questions";

export type AnalysisState = Partial<{
  summary: Summary;
  outline: Outline;
  mindMap: MindMap;
  evidence: Evidence;
  questions: Questions;
}>;

export type Criterion = { title: string; description: string | null };

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
  summary: Annotation<Summary | undefined>,
  outline: Annotation<Outline | undefined>,
  mindMap: Annotation<MindMap | undefined>,
  evidence: Annotation<Evidence | undefined>,
  questions: Annotation<Questions | undefined>,
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

export async function runPresentationGraph({
  transcript,
  teamName,
  projectTitle,
  criteria,
  previous,
  deps,
}: {
  transcript: string;
  teamName: string;
  projectTitle: string | null;
  criteria: Criterion[];
  previous: AnalysisState;
  deps: GraphDependencies;
}): Promise<{ insights: PresentationInsights; jury: JuryReport; removedQuotes: number }> {
  // Cada agente reutiliza su resultado guardado si ya terminó en un intento
  // anterior, y si su modelo falla prueba el siguiente de la cadena.
  function agent<T extends Record<string, unknown>>(
    node: AnalysisNode,
    schema: z.ZodType<T>,
    instructions: (state: State) => string,
  ) {
    return async (state: State) => {
      const saved = previous[node];
      if (saved) return { [node]: saved };
      const { result } = await withModelFallback(
        "analysis",
        async (modelId, signal) => {
          await deps.acquireSlot();
          const output = await model(modelId)
            .withStructuredOutput(schema, { name: node, method: "jsonSchema" })
            .invoke(
              [
                { role: "system", content: BASE_RULES },
                { role: "user", content: `${instructions(state)}\n\n${context(state)}` },
              ],
              { signal },
            );
          return schema.parse(output);
        },
        { deadlineMs: deps.deadlineMs, attemptTimeoutMs: 120_000 },
      );
      await deps.saveNode(node, result);
      return { [node]: result };
    };
  }

  const graph = new StateGraph(GraphState)
    .addNode(
      "summaryAgent",
      agent("summary", summarySchema, () =>
        "Redacta un resumen fiel de la exposición (2-4 párrafos) y entre 3 y 8 ideas clave.",
      ),
    )
    .addNode(
      "outlineAgent",
      agent("outline", outlineSchema, () =>
        "Construye el esquema de la exposición en el orden en que se presentó (secciones con viñetas) y lista los próximos pasos o tareas que se mencionen explícitamente; si no hay, deja la lista vacía.",
      ),
    )
    .addNode(
      "mindMapAgent",
      agent("mindMap", mindMapSchema, () =>
        "Crea un mapa mental breve y jerárquico: un título central y entre 2 y 6 ramas con ideas cortas, útil para repasar la exposición.",
      ),
    )
    .addNode(
      "evidenceAgent",
      agent("evidence", juryEvidenceSchema, (state) =>
        state.criteria.length
          ? `Para cada criterio de la rúbrica, copia LITERALMENTE las frases de la transcripción que aportan evidencia (máximo 4 por criterio) y explica en una línea por qué. Indica la cobertura: "clear", "partial" o "absent" si no se trata. No valores la calidad ni pongas nota.\n\nCriterios:\n${state.criteria
              .map((c, i) => `${i + 1}. ${c.title}${c.description ? ` — ${c.description}` : ""}`)
              .join("\n")}`
          : "No hay rúbrica: devuelve la lista de criterios vacía.",
      ),
    )
    .addNode(
      "questionsAgent",
      agent("questions", juryQuestionsSchema, () =>
        "Propón preguntas concretas que el jurado podría hacer para aclarar o profundizar lo expuesto, y señala puntos débiles: afirmaciones sin datos, partes poco explicadas o contradicciones. Cada punto debe referirse a algo que se dijo.",
      ),
    )
    .addNode("reviewer", async (state: State) => {
      const { criteria: verified, removed } = verifyEvidence(
        state.transcript,
        state.evidence?.criteria ?? [],
      );
      return { evidence: { criteria: verified }, review: { removedQuotes: removed } };
    })
    .addEdge(START, "summaryAgent")
    .addEdge(START, "outlineAgent")
    .addEdge(START, "mindMapAgent")
    .addEdge(START, "evidenceAgent")
    .addEdge(START, "questionsAgent")
    .addEdge(
      ["summaryAgent", "outlineAgent", "mindMapAgent", "evidenceAgent", "questionsAgent"],
      "reviewer",
    )
    .addEdge("reviewer", END)
    .compile();

  const final = await graph.invoke({ transcript, teamName, projectTitle, criteria });
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
    },
    removedQuotes: final.review?.removedQuotes ?? 0,
  };
}
