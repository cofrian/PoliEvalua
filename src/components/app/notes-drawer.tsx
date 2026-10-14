"use client";

import { NotebookPen } from "lucide-react";

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
  teamId,
  userId,
  initialNotes,
}: {
  teamId: string;
  userId: string;
  initialNotes: Note[];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className="fixed right-4 bottom-24 z-40 h-12 rounded-full px-5 font-bold shadow-lg lg:hidden"
          type="button"
        >
          <NotebookPen className="size-4" /> Notas ({initialNotes.length})
        </Button>
      </SheetTrigger>
      <SheetContent className="h-[85svh] overflow-y-auto px-4 pb-6" side="bottom">
        <SheetHeader className="px-0">
          <SheetTitle className="font-display text-2xl">Notas del equipo</SheetTitle>
        </SheetHeader>
        <NotesPanel initialNotes={initialNotes} teamId={teamId} userId={userId} />
      </SheetContent>
    </Sheet>
  );
}
