// El audio ya no se conserva: se borra en cuanto existe la transcripción.
export function GET() {
  return Response.json(
    { error: "El audio no se conserva tras la transcripción." },
    { status: 410 },
  );
}
