"use client";

import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { selectSpaceAction } from "@/app/(app)/espacios/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SpaceOption = { id: string; name: string };

/** Espacio actual siempre visible, con acceso rápido a cambiar o ver todos. */
export function SpaceSwitcher({
  current,
  spaces,
  className,
}: {
  current: SpaceOption;
  spaces: SpaceOption[];
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function choose(id: string) {
    if (id === current.id) return;
    const formData = new FormData();
    formData.set("eventId", id);
    startTransition(() => selectSpaceAction(formData));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Espacio actual: ${current.name}. Cambiar de espacio`}
        className={cn("flex max-w-40 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted sm:max-w-56", className)}
        disabled={pending}
      >
        <span className="flex-1 truncate text-left">{current.name}</span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Tus espacios</DropdownMenuLabel>
        {spaces.map((space) => (
          <DropdownMenuItem key={space.id} onSelect={() => choose(space.id)}>
            <Check
              aria-hidden="true"
              className={space.id === current.id ? "size-4" : "size-4 opacity-0"}
            />
            <span className="truncate">{space.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/espacios">
            <LayoutGrid aria-hidden="true" className="size-4" /> Ver todos los espacios
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/espacios/nuevo">
            <Plus aria-hidden="true" className="size-4" /> Nuevo espacio
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
