import { createClient } from "@/lib/supabase/server";

type Sponsor = {
  name: string;
  url: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  display_height: number;
  dark_background: boolean;
};

// Respaldo si la base de datos no responde. Alturas calculadas para que todos
// los logos ocupen la misma superficie visual (ver /admin/patrocinadores).
const FALLBACK: Sponsor[] = [
  { name: "Sigma Data Club", url: null, logo_light_url: "/brand/sponsors/sigma-light.svg", logo_dark_url: "/brand/sponsors/sigma-dark.svg", display_height: 38, dark_background: false },
  { name: "ETSINF", url: null, logo_light_url: "/brand/sponsors/etsinf.svg", logo_dark_url: "/brand/sponsors/etsinf.svg", display_height: 36, dark_background: true },
  { name: "Ajuntament de València", url: null, logo_light_url: "/brand/sponsors/ajuntament-color-crop.svg", logo_dark_url: "/brand/sponsors/ajuntament-color-crop.svg", display_height: 48, dark_background: true },
  { name: "Generación Espontánea", url: null, logo_light_url: "/brand/sponsors/generacion-espontanea-crop.png", logo_dark_url: "/brand/sponsors/generacion-espontanea-crop.png", display_height: 48, dark_background: true },
  { name: "UPV · Vicerrectorado de Estudiantes y Emprendimiento", url: null, logo_light_url: "/brand/sponsors/upv-vee.jpg", logo_dark_url: "/brand/sponsors/upv-vee.jpg", display_height: 54, dark_background: false },
];

async function loadSponsors(): Promise<Sponsor[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sponsors")
      .select("name, url, logo_light_url, logo_dark_url, display_height, dark_background")
      .order("order");
    const withLogo = (data ?? []).filter((s) => s.logo_light_url);
    return error || !withLogo.length ? FALLBACK : withLogo;
  } catch {
    return FALLBACK;
  }
}

/* eslint-disable @next/next/no-img-element -- los logos pueden venir de Storage */
export async function SponsorBar() {
  const sponsors = await loadSponsors();

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-5 sm:gap-x-12">
      {sponsors.map((sponsor) => {
        const dark = sponsor.logo_dark_url ?? sponsor.logo_light_url!;
        const darkBox = sponsor.dark_background ? "dark:rounded-sm dark:bg-white dark:p-1" : "";
        const style = { height: sponsor.display_height };
        const logos =
          dark === sponsor.logo_light_url ? (
            <img alt={sponsor.name} className={`w-auto object-contain ${darkBox}`} src={dark} style={style} />
          ) : (
            <>
              <img alt={sponsor.name} className="w-auto object-contain dark:hidden" src={sponsor.logo_light_url!} style={style} />
              <img alt={sponsor.name} className={`hidden w-auto object-contain dark:block ${darkBox}`} src={dark} style={style} />
            </>
          );
        return sponsor.url ? (
          <a href={sponsor.url} key={sponsor.name} rel="noreferrer" target="_blank">
            {logos}
          </a>
        ) : (
          <span key={sponsor.name}>{logos}</span>
        );
      })}
    </div>
  );
}
