import { deleteSponsorAction, saveSponsorAction } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

type Sponsor = {
  id: string;
  name: string;
  url: string | null;
  order: number | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  display_height: number;
  aspect_ratio: number;
  dark_background: boolean;
};

function SponsorForm({ sponsor }: { sponsor: Sponsor | null }) {
  return (
    <form action={saveSponsorAction} className="grid gap-3 sm:grid-cols-6">
      <input name="id" type="hidden" value={sponsor?.id ?? ""} />
      <label className="space-y-1 text-sm font-semibold sm:col-span-3">
        <span className="block">Nombre</span>
        <Input defaultValue={sponsor?.name ?? ""} name="name" required />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-2">
        <span className="block">Web</span>
        <Input defaultValue={sponsor?.url ?? ""} name="url" placeholder="https://" />
      </label>
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">Orden</span>
        <Input defaultValue={sponsor?.order ?? ""} inputMode="numeric" name="order" />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-2">
        <span className="block">Altura en el pie (px)</span>
        <Input
          defaultValue={sponsor?.display_height ?? 40}
          inputMode="numeric"
          name="displayHeight"
        />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-2">
        <span className="block">Proporción (ancho ÷ alto)</span>
        <Input
          defaultValue={sponsor?.aspect_ratio ?? 3}
          inputMode="decimal"
          name="aspectRatio"
        />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm font-semibold sm:col-span-2">
        <input
          defaultChecked={sponsor?.dark_background ?? true}
          name="darkBackground"
          type="checkbox"
        />
        Fondo blanco en modo oscuro
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-3">
        <span className="block">Logo (modo claro)</span>
        <input accept="image/*" className="block text-sm" name="logoLight" type="file" />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-3">
        <span className="block">Logo (modo oscuro, opcional)</span>
        <input accept="image/*" className="block text-sm" name="logoDark" type="file" />
      </label>
      <div className="sm:col-span-6">
        <Button type="submit">{sponsor ? "Guardar" : "Añadir patrocinador"}</Button>
      </div>
    </form>
  );
}

export default async function AdminSponsorsPage() {
  const { supabase, event } = await getSession();
  const { data: sponsors } = await supabase
    .from("sponsors")
    .select(
      "id, name, url, order, logo_light_url, logo_dark_url, display_height, aspect_ratio, dark_background",
    )
    .eq("event_id", event.id)
    .order("order");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estos logos salen en el pie de la pantalla de acceso, en el orden indicado.
        Ajusta la altura para que todos se vean con el mismo peso visual.
      </p>
      {((sponsors ?? []) as Sponsor[]).map((sponsor) => (
        <section className={cardClass} key={sponsor.id}>
          <div className="mb-4 flex items-center gap-4">
            {sponsor.logo_light_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={sponsor.name}
                className="w-auto object-contain"
                src={sponsor.logo_light_url}
                style={{ height: sponsor.display_height }}
              />
            ) : (
              <span className="text-sm text-muted-foreground">Sin logo</span>
            )}
          </div>
          <SponsorForm sponsor={sponsor} />
          <form action={deleteSponsorAction} className="mt-2">
            <input name="id" type="hidden" value={sponsor.id} />
            <Button className="h-8 text-destructive" type="submit" variant="ghost">
              Quitar patrocinador
            </Button>
          </form>
        </section>
      ))}
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-xl">Nuevo patrocinador</h2>
        <SponsorForm sponsor={null} />
      </section>
    </div>
  );
}
