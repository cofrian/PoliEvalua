"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type EditableCriterion = {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  order: number;
  updated_at: string;
  rubric_levels: {
    id: string;
    score: number;
    label: string;
    descriptor: string | null;
    example?: string | null;
  }[];
};

const DEFAULT_LEVELS = [
  "Muy insuficiente",
  "Insuficiente",
  "Adecuado",
  "Muy bueno",
  "Excelente",
];

export function RubricEditor({
  canEdit,
  initialCriteria,
  isAdmin,
  locked,
  rubricId,
  userId,
}: {
  canEdit: boolean;
  initialCriteria: EditableCriterion[];
  isAdmin: boolean;
  locked: boolean;
  rubricId: string;
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [criteria, setCriteria] = useState(initialCriteria);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setCriteria(initialCriteria), [initialCriteria]);

  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function recordChange(summary: string, diff?: Record<string, unknown>) {
    await supabase.from("rubric_changes").insert({
      rubric_id: rubricId,
      user_id: userId,
      summary,
      diff: diff ?? null,
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = criteria.findIndex((c) => c.id === active.id);
    const newIndex = criteria.findIndex((c) => c.id === over.id);
    const next = arrayMove(criteria, oldIndex, newIndex);
    setCriteria(next);

    const results = await Promise.all(
      next.map((criterion, index) =>
        supabase
          .from("rubric_criteria")
          .update({ order: index + 1 })
          .eq("id", criterion.id),
      ),
    );
    if (results.some((r) => r.error)) {
      toast.error("No se ha podido guardar el nuevo orden.");
    } else {
      await recordChange(
        `ha movido «${criteria[oldIndex].title}» a la posición ${newIndex + 1}`,
      );
    }
    router.refresh();
  }

  async function addCriterion() {
    setBusy(true);
    const { data, error } = await supabase
      .from("rubric_criteria")
      .insert({
        rubric_id: rubricId,
        title: "Nuevo criterio",
        weight: 0,
        order: criteria.length + 1,
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      toast.error("No se ha podido añadir el criterio.");
      return;
    }

    await supabase.from("rubric_levels").insert(
      DEFAULT_LEVELS.map((label, index) => ({
        criterion_id: data.id,
        score: index + 1,
        label,
        descriptor: null,
      })),
    );
    await recordChange("ha añadido un criterio nuevo");
    setBusy(false);
    setEditing(data.id);
    router.refresh();
  }

  async function removeCriterion(criterion: EditableCriterion) {
    if (
      !window.confirm(
        `¿Quitar «${criterion.title}»? Las puntuaciones ya puestas se conservan pero dejan de contar.`,
      )
    ) {
      return;
    }
    const { error } = await supabase
      .from("rubric_criteria")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", criterion.id);
    if (error) {
      toast.error("No se ha podido quitar el criterio.");
      return;
    }
    await recordChange(`ha quitado el criterio «${criterion.title}»`);
    router.refresh();
  }

  async function toggleLock() {
    setBusy(true);
    const { error } = await supabase
      .from("rubrics")
      .update({ locked: !locked })
      .eq("id", rubricId);
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("100")
          ? "Los pesos deben sumar 100 % para bloquear la rúbrica."
          : "No se ha podido cambiar el bloqueo.",
      );
      return;
    }
    await recordChange(locked ? "ha desbloqueado la rúbrica" : "ha bloqueado la rúbrica");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <WeightBar total={total} />

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void addCriterion()} type="button">
            <Plus className="size-4" /> Añadir criterio
          </Button>
          {isAdmin ? (
            <Button
              disabled={busy}
              onClick={() => void toggleLock()}
              type="button"
              variant="outline"
            >
              {locked ? (
                <>
                  <LockOpen className="size-4" /> Desbloquear rúbrica
                </>
              ) : (
                <>
                  <Lock className="size-4" /> Bloquear rúbrica
                </>
              )}
            </Button>
          ) : null}
        </div>
      ) : null}

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={(event) => void onDragEnd(event)}
        sensors={sensors}
      >
        <SortableContext
          items={criteria.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="space-y-3">
            {criteria.map((criterion, index) => (
              <SortableCriterion
                canEdit={canEdit}
                criterion={criterion}
                editing={editing === criterion.id}
                index={index}
                key={criterion.id}
                onCancel={() => setEditing(null)}
                onEdit={() => setEditing(criterion.id)}
                onRemove={() => void removeCriterion(criterion)}
                onSaved={async (summary, diff) => {
                  await recordChange(summary, diff);
                  setEditing(null);
                  router.refresh();
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function WeightBar({ total }: { total: number }) {
  const ok = Math.abs(total - 100) < 0.01;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm font-semibold">
        <span>Suma de pesos</span>
        <span className={ok ? "text-leaf-500" : "text-coral-400"}>
          {total} % {ok ? "✔" : `(deben sumar 100 %)`}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-line dark:bg-[#262838]">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            ok ? "bg-leaf-500" : total > 100 ? "bg-coral-400" : "bg-orange-500",
          )}
          style={{ width: `${Math.min(total, 100)}%` }}
        />
      </div>
    </div>
  );
}

function SortableCriterion({
  canEdit,
  criterion,
  editing,
  index,
  onCancel,
  onEdit,
  onRemove,
  onSaved,
}: {
  canEdit: boolean;
  criterion: EditableCriterion;
  editing: boolean;
  index: number;
  onCancel: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onSaved: (summary: string, diff: Record<string, unknown>) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: criterion.id, disabled: !canEdit || editing });

  return (
    <li
      className={cn(
        "rounded-xl border border-line bg-white p-4 dark:border-[#262838] dark:bg-[#151621]",
        isDragging && "relative z-10 shadow-lg",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {editing ? (
        <CriterionForm criterion={criterion} onCancel={onCancel} onSaved={onSaved} />
      ) : (
        <div className="flex gap-3">
          {canEdit ? (
            <button
              aria-label={`Mover ${criterion.title}`}
              className="mt-1 cursor-grab touch-none text-muted-foreground"
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-lg leading-snug">
                {index + 1}. {criterion.title}
              </h3>
              <span className="shrink-0 font-bold">{criterion.weight} %</span>
            </div>
            {criterion.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {criterion.description}
              </p>
            ) : null}
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-muted-foreground">
                Ver los {criterion.rubric_levels.length} niveles
              </summary>
              <ul className="mt-2 space-y-1.5">
                {criterion.rubric_levels.map((level) => (
                  <li key={level.id}>
                    <strong>
                      {level.score} · {level.label}:
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      {level.descriptor || "—"}
                    </span>
                    {level.example ? (
                      <span className="mt-0.5 block text-xs italic text-muted-foreground">Ejemplo: {level.example}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
            {canEdit ? (
              <div className="mt-3 flex gap-2">
                <Button onClick={onEdit} size="sm" type="button" variant="outline">
                  Editar
                </Button>
                <Button
                  aria-label={`Quitar ${criterion.title}`}
                  onClick={onRemove}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" /> Quitar
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}

function CriterionForm({
  criterion,
  onCancel,
  onSaved,
}: {
  criterion: EditableCriterion;
  onCancel: () => void;
  onSaved: (summary: string, diff: Record<string, unknown>) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(criterion.title);
  const [description, setDescription] = useState(criterion.description ?? "");
  const [weight, setWeight] = useState(String(criterion.weight));
  const [levels, setLevels] = useState(criterion.rubric_levels);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const numericWeight = Number(weight.replace(",", "."));
    if (!title.trim()) {
      toast.error("El criterio necesita un nombre.");
      return;
    }
    if (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 100) {
      toast.error("El peso debe estar entre 0 y 100.");
      return;
    }

    setSaving(true);
    // Control optimista: si otra persona lo cambió mientras editabas, no se pisa.
    const { data: updated, error } = await supabase
      .from("rubric_criteria")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        weight: numericWeight,
      })
      .eq("id", criterion.id)
      .eq("updated_at", criterion.updated_at)
      .select("id");

    if (error) {
      setSaving(false);
      toast.error("No se ha podido guardar el criterio.");
      return;
    }
    if (!updated?.length) {
      setSaving(false);
      toast.error(
        "Otra persona ha cambiado este criterio mientras lo editabas. Se recargarán sus cambios; revisa y vuelve a guardar.",
      );
      onCancel();
      return;
    }

    const changedLevels = levels.filter((level) => {
      const original = criterion.rubric_levels.find((l) => l.id === level.id);
      return (
        original?.label !== level.label ||
        (original?.descriptor ?? "") !== (level.descriptor ?? "") ||
        (original?.example ?? "") !== (level.example ?? "")
      );
    });
    if (changedLevels.length) {
      const { error: levelsError } = await supabase.from("rubric_levels").upsert(
        changedLevels.map((level) => ({
          id: level.id,
          criterion_id: criterion.id,
          score: level.score,
          label: level.label.trim() || DEFAULT_LEVELS[level.score - 1] || String(level.score),
          descriptor: level.descriptor?.trim() || null,
          example: level.example?.trim() || null,
        })),
      );
      if (levelsError) toast.error("No se han podido guardar los niveles.");
    }

    const parts: string[] = [];
    if (title.trim() !== criterion.title) parts.push(`el nombre a «${title.trim()}»`);
    if (numericWeight !== criterion.weight) parts.push(`el peso a ${numericWeight} %`);
    if ((description.trim() || null) !== criterion.description) parts.push("la descripción");
    if (changedLevels.length) parts.push(`${changedLevels.length} nivel(es)`);

    setSaving(false);
    await onSaved(
      parts.length
        ? `ha cambiado en «${criterion.title}» ${parts.join(", ")}`
        : `ha revisado «${criterion.title}» sin cambios`,
      {
        criterion_id: criterion.id,
        before: { title: criterion.title, weight: criterion.weight },
        after: { title: title.trim(), weight: numericWeight },
      },
    );
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void save(event)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className="space-y-1 text-sm font-semibold">
          <span>Nombre del criterio</span>
          <Input onChange={(e) => setTitle(e.target.value)} value={title} />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>Peso (%)</span>
          <Input
            inputMode="decimal"
            onChange={(e) => setWeight(e.target.value)}
            value={weight}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">
        <span>Descripción (opcional)</span>
        <Textarea
          className="min-h-16"
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
      </label>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Niveles</legend>
        {levels.map((level, i) => (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]" key={level.id}>
            <Input
              aria-label={`Nombre del nivel ${level.score}`}
              onChange={(e) =>
                setLevels((current) =>
                  current.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                )
              }
              value={level.label}
            />
            <Textarea
              aria-label={`Descripción del nivel ${level.score}`}
              className="min-h-14"
              onChange={(e) =>
                setLevels((current) =>
                  current.map((l, j) =>
                    j === i ? { ...l, descriptor: e.target.value } : l,
                  ),
                )
              }
              placeholder={`Qué significa un ${level.score}`}
              value={level.descriptor ?? ""}
            />
            <Textarea
              aria-label={`Ejemplo del nivel ${level.score}`}
              className="min-h-12 text-xs sm:col-start-2"
              onChange={(e) =>
                setLevels((current) =>
                  current.map((l, j) => (j === i ? { ...l, example: e.target.value } : l)),
                )
              }
              placeholder={`Ejemplo opcional: cómo se ve en la práctica un ${level.score}`}
              value={level.example ?? ""}
            />
          </div>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button disabled={saving} type="submit">
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
