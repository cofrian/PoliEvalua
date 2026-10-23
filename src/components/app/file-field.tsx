"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ChangeEvent } from "react";

/**
 * Selector de archivo con el texto de la app (el nativo sale en el idioma del
 * navegador y sin estilo). Se envía con el formulario como un input normal.
 */
export function FileField({
  name,
  accept,
  label,
  onChange,
}: {
  name?: string;
  accept?: string;
  /** Nombre accesible del campo. */
  label?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations("common");
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
        htmlFor={id}
      >
        <Upload aria-hidden="true" className="size-4" /> {t("chooseFile")}
        <input
          accept={accept}
          aria-label={label}
          className="sr-only"
          id={id}
          name={name}
          onChange={(event) => {
            setFileName(event.target.files?.[0]?.name ?? null);
            onChange?.(event);
          }}
          type="file"
        />
      </label>
      <span className="truncate text-muted-foreground">{fileName ?? t("noFile")}</span>
    </div>
  );
}
