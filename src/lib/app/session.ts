import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "judge" | "mentor";

export const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  judge: "Juez",
  mentor: "Mentor",
};

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, disabled")
    .eq("id", user.id)
    .single();

  if (!profile || profile.disabled) redirect("/login?reason=disabled");

  const role = profile.role as Role;

  return {
    supabase,
    user,
    profile: { ...profile, role },
    canVote: role === "admin" || role === "judge",
    isAdmin: role === "admin",
  };
});
