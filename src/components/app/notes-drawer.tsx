"use client";

import { NotebookPen } from "lucide-react";
import { useTranslations } from "next-intl";

import { NotesPanel, type Note } from "@/components/app/notes-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// En móvil las notas se abren en un panel desde abajo; en escritorio van al lado.
export function NotesDrawer({
  eventId,
  teamId,
  userId,
  initialNotes,
}: {
  eventId: string;
  teamId: string;
  userId: string;
  initialNotes: Note[];
}) {
  const t = useTranslations("notes");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className="fixed right-4 bottom-24 z-40 h-12 rounded-full px-5 font-bold shadow-lg lg:hidden"
          type="button"
        >
          <NotebookPen className="size-4" /> {t("button", { count: initialNotes.length })}
        </Button>
      </SheetTrigger>
      <SheetContent className="h-[85svh] overflow-y-auto px-4 pb-6" side="bottom">
        <SheetHeader className="px-0">
          <SheetTitle className="font-display text-xl">{t("drawerTitle")}</SheetTitle>
        </SheetHeader>
        <NotesPanel eventId={eventId} initialNotes={initialNotes} teamId={teamId} userId={userId} />
      </SheetContent>
    </Sheet>
  );
}
