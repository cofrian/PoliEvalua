import { CreateSpaceForm } from "@/components/app/create-space-form";

export default function NewSpacePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">Creación guiada</p>
      <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Nuevo espacio</h1>
      <p className="mt-3 text-muted-foreground">
        Empezaremos por la identidad y el acceso. Después podrás configurar personas, rúbricas y formularios.
      </p>
      <div className="mt-8 rounded-xl border border-line bg-white p-5 sm:p-7 dark:border-[#383C3D] dark:bg-[#1B1D1E]">
        <CreateSpaceForm />
      </div>
    </div>
  );
}
