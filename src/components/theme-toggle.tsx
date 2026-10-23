"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("common");

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        aria-label={t("themeToggle")}
        className="size-9"
        disabled
        size="icon-lg"
        variant="outline"
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      aria-label={isDark ? t("lightMode") : t("darkMode")}
      className="size-9"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      size="icon-lg"
      type="button"
      variant="outline"
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
