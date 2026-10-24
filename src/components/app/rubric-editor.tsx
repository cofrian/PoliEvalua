"use client";

import { useTranslations } from "next-intl";
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

const LEVEL_SCORES = [1, 2, 3, 4, 5] as const;

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
  const t = useTranslations("rubricEditor");
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
      toast.error(t("orderError"));
    } else {
      await recordChange(
        t("moved", { title: criteria[oldIndex].title, position: newIndex + 1 }),
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
        title: t("newCriterion"),
        weight: 0,
        order: criteria.length + 1,
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      toast.error(t("addError"));
      return;
    }

    await supabase.from("rubric_levels").insert(
      LEVEL_SCORES.map((score) => ({
        criterion_id: data.id,
        score,
        label: t(`levels.${score}`),
        descriptor: null,
      })),
    );
    await recordChange(t("added"));
    setBusy(false);
    setEditing(data.id);
    router.refresh();
  }

  async function removeCriterion(criterion: EditableCriterion) {
    if (
      !window.confirm(
        t("removeConfirm", { title: criterion.title }),
      )
    ) {
      return;
    }
    const { error } = await supabase
      .from("rubric_criteria")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", criterion.id);
    if (error) {
      toast.error(t("removeError"));
      return;
    }
    await recordChange(t("removed", { title: criterion.title }));
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
          ? t("lockWeights")
          : t("lockError"),
      );
      return;
    }
    await recordChange(locked ? t("unlocked") : t("locked"));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {criteria.length ? <WeightBar total={total} /> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void addCriterion()} type="button">
            <Plus className="size-4" /> {t("add")}
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
                  <LockOpen className="size-4" /> {t("unlock")}
                </>
              ) : (
                <>
                  <Lock className="size-4" /> {t("lock")}
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
  const t = useTranslations("rubricEditor");
  const ok = Math.abs(total - 100) < 0.01;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm font-semibold">
        <span>{t("weightSum")}</span>
        <span className={ok ? "text-leaf-500 dark:text-green-400" : "text-coral-400"}>
          {total} % {ok ? "✔" : t("mustSum")}
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
  const t = useTranslations("rubricEditor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: criterion.id, disabled: !canEdit || editing });

  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-white p-4 dark:bg-card",
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
              aria-label={t("move", { title: criterion.title })}
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
                {t("seeLevels", { count: criterion.rubric_levels.length })}
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
                      <span className="mt-0.5 block text-xs italic text-muted-foreground">{t("example", { example: level.example })}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
            {canEdit ? (
              <div className="mt-3 flex gap-2">
                <Button onClick={onEdit} size="sm" type="button" variant="outline">
                  {t("edit")}
                </Button>
                <Button
                  aria-label={t("removeLabel", { title: criterion.title })}
                  onClick={onRemove}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" /> {t("remove")}
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
  const t = useTranslations("rubricEditor");
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
      toast.error(t("nameRequired"));
      return;
    }
    if (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 100) {
      toast.error(t("weightRange"));
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
      toast.error(t("saveError"));
      return;
    }
    if (!updated?.length) {
      setSaving(false);
      toast.error(
        t("conflict"),
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
          label: level.label.trim() || (level.score >= 1 && level.score <= 5 ? t(`levels.${level.score}`) : String(level.score)),
          descriptor: level.descriptor?.trim() || null,
          example: level.example?.trim() || null,
        })),
      );
      if (levelsError) toast.error(t("levelsError"));
    }

    const parts: string[] = [];
    if (title.trim() !== criterion.title) parts.push(t("changedName", { title: title.trim() }));
    if (numericWeight !== criterion.weight) parts.push(t("changedWeight", { weight: numericWeight }));
    if ((description.trim() || null) !== criterion.description) parts.push(t("changedDescription"));
    if (changedLevels.length) parts.push(t("changedLevels", { count: changedLevels.length }));

    setSaving(false);
    await onSaved(
      parts.length
        ? t("changed", { title: criterion.title, parts: parts.join(", ") })
        : t("unchanged", { title: criterion.title }),
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
          <span>{t("name")}</span>
          <Input onChange={(e) => setTitle(e.target.value)} value={title} />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>{t("weight")}</span>
          <Input
            inputMode="decimal"
            onChange={(e) => setWeight(e.target.value)}
            value={weight}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">
        <span>{t("description")}</span>
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
              aria-label={t("levelName", { score: level.score })}
              onChange={(e) =>
                setLevels((current) =>
                  current.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                )
              }
              value={level.label}
            />
            <Textarea
              aria-label={t("levelDescription", { score: level.score })}
              className="min-h-14"
              onChange={(e) =>
                setLevels((current) =>
                  current.map((l, j) =>
                    j === i ? { ...l, descriptor: e.target.value } : l,
                  ),
                )
              }
              placeholder={t("levelPlaceholder", { score: level.score })}
              value={level.descriptor ?? ""}
            />
            <Textarea
              aria-label={t("levelExample", { score: level.score })}
              className="min-h-12 text-xs sm:col-start-2"
              onChange={(e) =>
                setLevels((current) =>
                  current.map((l, j) => (j === i ? { ...l, example: e.target.value } : l)),
                )
              }
              placeholder={t("levelExamplePlaceholder", { score: level.score })}
              value={level.example ?? ""}
            />
          </div>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button disabled={saving} type="submit">
          {saving ? t("saving") : t("save")}
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
