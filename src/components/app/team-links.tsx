"use client";

import { ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/app/ui";
import { createClient } from "@/lib/supabase/client";

export type TeamLink = {
  id: string;
  kind: LinkKind;
  url: string;
  label: string | null;
};

type LinkKind = "repo" | "web" | "video" | "slides" | "drive" | "other";

const KINDS: LinkKind[] = ["repo", "web", "video", "slides", "drive", "other"];

/** Sugiere el tipo a partir del dominio para ahorrar un paso. */
function guessKind(url: string): LinkKind | null {
  if (/github\.com|gitlab|bitbucket/i.test(url)) return "repo";
  if (/youtu\.?be|vimeo|loom\.com|mediaupv|polimedia/i.test(url)) return "video";
  if (/docs\.google\.com\/presentation|canva\.com|slides|prezi|pitch\.com/i.test(url)) return "slides";
  if (/drive\.google\.com|onedrive|sharepoint|dropbox/i.test(url)) return "drive";
  return null;
}

/**
 * Entregas del grupo como enlaces: no se sube ningún archivo. La RLS limita
 * quién ve y edita (integrantes del grupo, jurado y gestión).
 */
export function TeamLinks({
  eventId,
  teamId,
  initialLinks,
  canEdit,
  driveUrl,
  instructions,
}: {
  eventId: string;
  teamId: string;
  initialLinks: TeamLink[];
  canEdit: boolean;
  driveUrl: string | null;
  instructions: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("links");
  const kindLabel = (value: LinkKind) => t(`kind.${value}`);
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<LinkKind>("repo");
  const [kindTouched, setKindTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addLink() {
    const value = url.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(value)) {
      toast.error(t("invalid"));
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("team_links").insert({
      event_id: eventId,
      team_id: teamId,
      kind,
      url: value,
      label: label.trim() || null,
      created_by: auth.user?.id,
    });
    setBusy(false);
    if (error) {
      toast.error(t("saveError"));
      return;
    }
    setUrl("");
    setLabel("");
    setKindTouched(false);
    toast.success(t("added"));
    router.refresh();
  }

  async function removeLink(id: string) {
    const { error } = await supabase.from("team_links").delete().eq("id", id);
    if (error) {
      toast.error(t("removeError"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      {instructions ? <p className="whitespace-pre-line text-muted-foreground">{instructions}</p> : null}
      {driveUrl ? (
        <a
          className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 font-semibold hover:bg-primary/10"
          href={driveUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <FolderOpen aria-hidden="true" className="size-4" /> {t("sharedFolder")}
          <ExternalLink aria-hidden="true" className="ml-auto size-4" />
        </a>
      ) : null}

      {initialLinks.length ? (
        <ul className="space-y-2">
          {initialLinks.map((link) => (
            <li className="flex items-center gap-2" key={link.id}>
              <a
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted"
                href={link.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                  {kindLabel(link.kind)}
                </span>
                <span className="truncate">{link.label || link.url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink aria-hidden="true" className="ml-auto size-4 shrink-0" />
              </a>
              {canEdit ? (
                <Button
                  aria-label={t("remove", { name: link.label || kindLabel(link.kind) })}
                  className="size-9 shrink-0"
                  onClick={() => void removeLink(link.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("empty")}</p>
      )}

      {canEdit ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <Input
            aria-label={t("link")}
            inputMode="url"
            onChange={(event) => {
              setUrl(event.target.value);
              const guess = guessKind(event.target.value);
              if (guess && !kindTouched) setKind(guess);
            }}
            placeholder="https://github.com/…"
            value={url}
          />
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t("type")}
              className={selectClass}
              onChange={(event) => {
                setKind(event.target.value as LinkKind);
                setKindTouched(true);
              }}
              value={kind}
            >
              {KINDS.map((value) => (
                <option key={value} value={value}>{kindLabel(value)}</option>
              ))}
            </select>
            <Input
              aria-label={t("description")}
              className="h-9 min-w-40 flex-1"
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("description")}
              value={label}
            />
            <Button className="h-9" disabled={busy || !url.trim()} onClick={() => void addLink()} type="button">
              {t("add")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
