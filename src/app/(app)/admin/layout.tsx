import { redirect } from "next/navigation";

import { getSession } from "@/lib/app/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAdmin } = await getSession();
  if (!isAdmin) redirect("/equipos");

  return children;
}
