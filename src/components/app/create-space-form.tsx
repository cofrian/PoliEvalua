"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { createSpaceAction, type CreateSpaceState } from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EvaluationProposal } from "@/lib/ai/evaluation-proposal";
import { selectClass } from "@/lib/app/ui";

const initialState: CreateSpaceState = {};

const ROLE_VALUES = ["judge", "mentor", "teacher", "student", "reviewer", "viewer"] as const;
const MODULE_VALUES = ["participants", "rubric", "notes", "results", "sponsors"] as const;
const KIND_VALUES = ["hackathon", "class", "awards", "project", "custom"] as const;

type SpaceKind = "hackathon" | "class" | "awards" | "project" | "custom";

const templates: Record<SpaceKind, {
  participantMode: string;
  evaluationMode: string;
  academic: boolean;
  roles: string[];
  joinRoles: string[];
  modules: string[];
}> = {
  hackathon: {
    participantMode: "teams",
    evaluationMode: "rubric",
    academic: false,
    roles: ["judge", "mentor"],
    joinRoles: ["judge", "mentor"],
    modules: ["participants", "rubric", "notes", "results", "sponsors"],
  },
  class: {
    participantMode: "groups",
    evaluationMode: "mixed",
    academic: true,
    roles: ["teacher", "student"],
    joinRoles: ["student"],
    modules: ["participants", "rubric", "notes", "results"],
  },
  awards: {
    participantMode: "candidates",
    evaluationMode: "rubric",
    academic: false,
    roles: ["reviewer", "viewer"],
    joinRoles: ["viewer"],
    modules: ["participants", "rubric", "notes", "results"],
  },
  project: {
    participantMode: "individuals",
    evaluationMode: "mixed",
    academic: false,
    roles: ["teacher", "student", "reviewer"],
    joinRoles: ["student"],
    modules: ["participants", "rubric", "notes", "results"],
  },
  custom: {
    participantMode: "individuals",
    evaluationMode: "feedback",
    academic: false,
    roles: ["reviewer"],
    joinRoles: [],
    modules: ["participants", "notes"],
  },
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function CreateSpaceForm() {
  const [state, action, pending] = useActionState(createSpaceAction, initialState);
  const t = useTranslations("createSpace");
  const tKinds = useTranslations("spaceKinds");
  const roleOptions = ROLE_VALUES.map((value) => ({
    value,
    label: t(`roles.${value}.label`),
    description: t(`roles.${value}.description`),
  }));
  const moduleOptions = MODULE_VALUES.map((value) => ({
    value,
    label: t(`modules.${value}.label`),
    description: t(`modules.${value}.description`),
  }));
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [kind, setKind] = useState<SpaceKind>("hackathon");
  const [participantMode, setParticipantMode] = useState(templates.hackathon.participantMode);
  const [evaluationMode, setEvaluationMode] = useState(templates.hackathon.evaluationMode);
  const [academic, setAcademic] = useState(templates.hackathon.academic);
  const [roles, setRoles] = useState<string[]>(templates.hackathon.roles);
  const [joinRoles, setJoinRoles] = useState<string[]>(templates.hackathon.joinRoles);
  const [modules, setModules] = useState<string[]>(templates.hackathon.modules);
  const [prompt, setPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<string[]>([]);
  const [draftVersion, setDraftVersion] = useState(0);
  const [identity, setIdentity] = useState({ name: "", description: "" });
  const [draftAcademic, setDraftAcademic] = useState<EvaluationProposal["academic"]>(null);
  const [proposal, setProposal] = useState<EvaluationProposal | null>(null);
  const [draftModel, setDraftModel] = useState<string | null>(null);

  async function generateDraft() {
    if (prompt.trim().length < 3 || drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/space-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.reply) {
        setDraftError(body?.error ?? t("draftError"));
        return;
      }
      setDraftQuestions(Array.isArray(body.questions) ? body.questions : []);
      // Demasiado vago: el asistente pregunta y el formulario no se toca.
      if (!body.space) {
        setDraftReply(body.reply);
        return;
      }
      const space = body.space;
      const nextProposal: EvaluationProposal | null = body.proposal ?? null;
      setKind(space.kind);
      setParticipantMode(space.participantMode);
      setEvaluationMode(space.evaluationMode);
      setModules(space.modules);
      setRoles(space.enabledRoles);
      setJoinRoles(space.joinRoles);
      setAcademic(Boolean(nextProposal?.academic) || space.kind === "class");
      setDraftAcademic(nextProposal?.academic ?? null);
      setIdentity({ name: space.name, description: space.description ?? "" });
      if (!slugEdited) setSlug(slugify(space.name));
      setProposal(nextProposal);
      setDraftModel(typeof body.model === "string" ? body.model : null);
      setDraftReply(body.reply);
      setDraftVersion((version) => version + 1);
    } catch {
      setDraftError(t("connectError"));
    } finally {
      setDrafting(false);
    }
  }

  function chooseTemplate(nextKind: SpaceKind) {
    const template = templates[nextKind];
    setKind(nextKind);
    setParticipantMode(template.participantMode);
    setEvaluationMode(template.evaluationMode);
    setAcademic(template.academic);
    setRoles(template.roles);
    setJoinRoles(template.joinRoles);
    setModules(template.modules);
  }

  function toggleRole(role: string) {
    setRoles((current) => {
      const next = toggle(current, role);
      if (!next.includes(role)) setJoinRoles((join) => join.filter((item) => item !== role));
      return next;
    });
  }

  return (
    <form action={action} className="space-y-8" key={draftVersion}>
      <section className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
          <Sparkles aria-hidden="true" className="size-5" /> {t("aiTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("aiText")}
        </p>
        <Textarea
          aria-label={t("aiLabel")}
          defaultValue={prompt}
          maxLength={4000}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t("aiPlaceholder")}
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={drafting || prompt.trim().length < 3} onClick={() => void generateDraft()} type="button" variant="secondary">
            {drafting ? t("preparing") : t("prepare")}
          </Button>
          {drafting ? (
            <span className="text-sm text-muted-foreground" role="status">
              {t("slow")}
            </span>
          ) : null}
          {proposal ? (
            <span className="text-sm text-muted-foreground">
              {t("rubricReady", { name: proposal.evaluation.rubricName, count: proposal.evaluation.criteria.length })}
            </span>
          ) : null}
        </div>
        {draftError ? <p className="text-sm text-destructive" role="alert">{draftError}</p> : null}
        {draftReply ? (
          <p className="text-sm">{draftQuestions.length ? draftReply : t("reviewAndCreate", { reply: draftReply })}</p>
        ) : null}
        {draftQuestions.length ? (
          <div className="rounded-lg bg-upv-yellow/15 p-3 text-sm" role="status">
            <p className="font-semibold">{t("questionsTitle")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {draftQuestions.map((question) => <li key={question}>{question}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t("questionsHint")}</p>
          </div>
        ) : null}
      </section>
      {proposal ? <input name="assistantProposal" type="hidden" value={JSON.stringify(proposal)} /> : null}
      {proposal ? <input name="assistantPrompt" type="hidden" value={prompt} /> : null}
      {proposal && draftModel ? <input name="assistantModel" type="hidden" value={draftModel} /> : null}

      {state.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">{t("kind")}</legend>
        <p className="text-sm text-muted-foreground">{t("kindHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {KIND_VALUES.map((value) => [value, tKinds(value)] as const).map(([value, label]) => (
            <label className="cursor-pointer rounded-lg border border-input p-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={value}>
              <input
                checked={kind === value}
                className="sr-only"
                name="kind"
                onChange={() => chooseTemplate(value as SpaceKind)}
                type="radio"
                value={value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-heading text-xl font-semibold">{t("identity")}</legend>
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            defaultValue={identity.name}
            id="name"
            name="name"
            onChange={(event) => {
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
            placeholder={t("namePlaceholder")}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">{t("slug")}</Label>
          <Input
            id="slug"
            name="slug"
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
            placeholder={t("slugPlaceholder")}
            required
            value={slug}
          />
          <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">{t("description")}</Label>
          <Textarea defaultValue={identity.description} id="description" maxLength={500} name="description" placeholder={t("descriptionPlaceholder")} />
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-heading text-xl font-semibold">{t("manage")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="participantMode">{t("participantMode")}</Label>
            <select className={`${selectClass} w-full`} id="participantMode" name="participantMode" onChange={(event) => setParticipantMode(event.target.value)} value={participantMode}>
              {(["teams", "groups", "individuals", "candidates"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`participantModes.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="evaluationMode">{t("evaluationMode")}</Label>
            <select className={`${selectClass} w-full`} id="evaluationMode" name="evaluationMode" onChange={(event) => setEvaluationMode(event.target.value)} value={evaluationMode}>
              {(["rubric", "feedback", "mixed"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`evaluationModes.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {moduleOptions.map((module) => (
            <label className="flex cursor-pointer gap-3 rounded-lg border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={module.value}>
              <input
                checked={modules.includes(module.value)}
                className="mt-1 size-4"
                name="modules"
                onChange={() => setModules((current) => toggle(current, module.value))}
                type="checkbox"
                value={module.value}
              />
              <span><strong className="block text-sm">{module.label}</strong><span className="text-xs text-muted-foreground">{module.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">{t("academic")}</legend>
        <label className="flex items-center gap-3 rounded-lg border border-input p-3 text-sm font-semibold">
          <input checked={academic} name="academicEnabled" onChange={(event) => setAcademic(event.target.checked)} type="checkbox" />
          {t("academicToggle")}
        </label>
        {academic ? (
          <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold sm:col-span-2"><span className="block">{t("institution")}</span><Input defaultValue={draftAcademic?.institution ?? "Universitat Politècnica de València"} name="institution" required /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("school")}</span><Input defaultValue={draftAcademic?.school ?? ""} name="school" placeholder="ETSINF" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("degree")}</span><Input defaultValue={draftAcademic?.degree ?? ""} name="degree" placeholder={t("degreePlaceholder")} /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("subject")}</span><Input defaultValue={draftAcademic?.subjectName ?? ""} name="subjectName" required /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("subjectCode")}</span><Input defaultValue={draftAcademic?.subjectCode ?? ""} name="subjectCode" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("year")}</span><Input defaultValue={draftAcademic?.academicYear ?? ""} name="academicYear" placeholder="2026–2027" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("term")}</span><Input defaultValue={draftAcademic?.term ?? ""} name="term" placeholder={t("termPlaceholder")} /></label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">{t("who")}</legend>
        <p className="text-sm text-muted-foreground">{t("whoHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {roleOptions.map((role) => (
            <label className="flex cursor-pointer gap-3 rounded-lg border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={role.value}>
              <input
                checked={roles.includes(role.value)}
                className="mt-1 size-4"
                name="enabledRoles"
                onChange={() => toggleRole(role.value)}
                type="checkbox"
                value={role.value}
              />
              <span><strong className="block text-sm">{role.label}</strong><span className="text-xs text-muted-foreground">{role.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">{t("access")}</legend>
        <div className="space-y-2">
          <Label htmlFor="accessCode">{t("code")}</Label>
          <Input autoCapitalize="characters" autoComplete="off" className="uppercase" id="accessCode" minLength={6} name="accessCode" placeholder="INNOVA-2027" required />
        </div>
        <p className="text-sm text-muted-foreground">{t("codeHint")}</p>
        <div className="flex flex-wrap gap-3">
          {roleOptions.filter((role) => roles.includes(role.value) && role.value !== "teacher").map((role) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={role.value}>
              <input
                checked={joinRoles.includes(role.value)}
                className="size-4"
                name="joinRoles"
                onChange={() => setJoinRoles((current) => toggle(current, role.value))}
                type="checkbox"
                value={role.value}
              />
              {role.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Button disabled={pending} type="submit">
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
