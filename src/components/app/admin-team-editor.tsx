import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  addMemberAction,
  deleteTeamAction,
  removeMemberAction,
  renameMemberAction,
  saveTeamAction,
} from "@/app/(app)/admin/actions";
import { ActionForm } from "@/components/app/action-form";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/app/ui";

export type AdminTeam = {
  id: string;
  number: number | null;
  name: string;
  challenge_id: string | null;
  project_title: string | null;
  description: string | null;
  table_location: string | null;
  team_members: { id: string; full_name: string; email?: string | null; user_id?: string | null }[];
};

// Formulario de edición de un equipo y sus integrantes (solo admin).
export function AdminTeamEditor({
  team,
  challenges,
  allowDelete = true,
}: {
  team: AdminTeam | null;
  challenges: { id: string; name: string }[];
  allowDelete?: boolean;
}) {
  const t = useTranslations("teamEditor");
  return (
    <div className="space-y-4">
      <ActionForm action={saveTeamAction} className="grid gap-3 sm:grid-cols-6">
        <input name="id" type="hidden" value={team?.id ?? ""} />
        <label className="space-y-1 text-sm font-semibold sm:col-span-1">
          <span className="block">{t("number")}</span>
          <Input defaultValue={team?.number ?? ""} inputMode="numeric" name="number" />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-3">
          <span className="block">{t("name")}</span>
          <Input defaultValue={team?.name ?? ""} name="name" required />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-2">
          <span className="block">{t("challenge")}</span>
          {challenges.length ? (
            <select className={`${selectClass} w-full`} defaultValue={team?.challenge_id ?? ""} name="challengeId">
              <option value="">{t("noChallenge")}</option>
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="block text-xs font-normal text-muted-foreground">
              {t.rich("noChallenges", {
                link: (chunks) => (
                  <Link className="font-semibold underline" href="/admin/retos">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          )}
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-4">
          <span className="block">{t("project")}</span>
          <Input defaultValue={team?.project_title ?? ""} name="projectTitle" />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-2">
          <span className="block">{t("table")}</span>
          <Input defaultValue={team?.table_location ?? ""} name="tableLocation" />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-6">
          <span className="block">{t("description")}</span>
          <Textarea
            className="min-h-16"
            defaultValue={team?.description ?? ""}
            name="description"
          />
        </label>
        <div className="flex gap-2 sm:col-span-6">
          <Button type="submit">{team ? t("save") : t("create")}</Button>
        </div>
      </ActionForm>

      {team ? (
        <>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t("members")}</p>
            {team.team_members.map((member) => (
              <div className="flex flex-wrap gap-2" key={member.id}>
                <ActionForm action={renameMemberAction} className="flex flex-1 flex-wrap gap-2">
                  <input name="id" type="hidden" value={member.id} />
                  <Input aria-label={t("memberName")} className="h-9 min-w-40 flex-1" defaultValue={member.full_name} name="fullName" />
                  <Input
                    aria-label={t("memberEmail")}
                    className="h-9 min-w-48 flex-1"
                    defaultValue={member.email ?? ""}
                    name="email"
                    placeholder={t("emailPlaceholder")}
                    type="email"
                  />
                  <span
                    className="flex h-9 items-center text-xs text-muted-foreground"
                    title={member.user_id ? t("linkedTitle") : t("notLinkedTitle")}
                  >
                    {member.user_id ? t("linked") : member.email ? t("notLinked") : ""}
                  </span>
                  <Button className="h-9" type="submit" variant="outline">
                    {t("saveMember")}
                  </Button>
                </ActionForm>
                <ActionForm action={removeMemberAction}>
                  <input name="id" type="hidden" value={member.id} />
                  <Button className="h-9" type="submit" variant="ghost">
                    {t("remove")}
                  </Button>
                </ActionForm>
              </div>
            ))}
            <ActionForm action={addMemberAction} resetOnSuccess className="flex gap-2">
              <input name="teamId" type="hidden" value={team.id} />
              <Input aria-label={t("memberName")} className="h-9" name="fullName" placeholder={t("newMember")} />
              <Input aria-label={t("memberEmail")} className="h-9" name="email" placeholder={t("emailOptional")} type="email" />
              <Button className="h-9" type="submit" variant="outline">
                {t("add")}
              </Button>
            </ActionForm>
          </div>

          {allowDelete ? (
            <ActionForm action={deleteTeamAction}>
              <input name="id" type="hidden" value={team.id} />
              <ConfirmSubmit
                confirmLabel={t("delete")}
                description={t("deleteText")}
                title={t("deleteTitle", { name: team.name })}
              >
                {t("delete")}
              </ConfirmSubmit>
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
