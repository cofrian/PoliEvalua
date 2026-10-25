import "server-only";

// Envío de correos con Resend (API HTTP, sin dependencias). Si falta la clave,
// no se envía nada y la app sigue funcionando igual.

const FROM = process.env.EMAIL_FROM ?? "PoliEvalúa <avisos@polievalua.tech>";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://polievalua.tech").replace(/\/$/, "");
}

export type Email = { to: string; subject: string; heading: string; body: string; cta?: { label: string; href: string }; footer: string };

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function render({ heading, body, cta, footer }: Email) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${escape(cta.href)}" style="background:#0f2a4a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${escape(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#14212e">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px">Poli<span style="color:#d4a017">[</span>Evalúa<span style="color:#d4a017">]</span></p>
<div style="background:#fff;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${escape(heading)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0">${escape(body)}</p>${button}
</div>
<p style="font-size:12px;color:#5b6b7b;line-height:1.5;margin:20px 4px 0">${escape(footer)}</p>
</div></body></html>`;
}

/** Envía en lotes de hasta 100 (límite de Resend). Devuelve cuántos salieron. */
export async function sendEmails(emails: Email[]): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emails.length) return 0;
  let sent = 0;
  for (let start = 0; start < emails.length; start += 100) {
    const batch = emails.slice(start, start + 100).map((email) => ({
      from: FROM,
      to: [email.to],
      subject: email.subject,
      html: render(email),
      text: [email.heading, email.body, email.cta ? `${email.cta.label}: ${email.cta.href}` : "", email.footer]
        .filter(Boolean)
        .join("\n\n"),
    }));
    try {
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (response.ok) sent += batch.length;
      else console.error("[email] Resend respondió", response.status, await response.text());
    } catch (error) {
      console.error("[email] No se pudo contactar con Resend", error);
    }
  }
  return sent;
}
