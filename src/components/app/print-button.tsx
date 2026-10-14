"use client";

import { Button } from "@/components/ui/button";

// El PDF se genera con el diálogo de impresión del navegador ("Guardar como PDF").
export function PrintButton() {
  return (
    <Button
      onClick={() => {
        // Abre todos los desplegables para que el PDF incluya los comentarios.
        document.querySelectorAll("details").forEach((d) => (d.open = true));
        window.print();
      }}
      type="button"
      variant="outline"
    >
      Descargar PDF
    </Button>
  );
}
