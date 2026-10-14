import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <Card className="w-full rounded-card border border-line bg-white/95 shadow-warm ring-0 backdrop-blur dark:border-[#262838] dark:bg-[#151621]/95">
      <CardHeader className="gap-2 px-5 pt-5 sm:px-7 sm:pt-7">
        <CardTitle className="font-display text-3xl leading-tight sm:text-4xl">
          {title}
        </CardTitle>
        <CardDescription className="text-sm leading-6 sm:text-base">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-7 sm:pb-7">
        {children}
      </CardContent>
    </Card>
  );
}
