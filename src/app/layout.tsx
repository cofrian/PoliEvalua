import type { Metadata } from "next";
import { Fraunces, Montserrat } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const fraunces = Fraunces({
  axes: ["SOFT", "WONK"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: "variable",
});

const montserrat = Montserrat({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "València Hack · Panel del jurado",
  description:
    "Plataforma de notas y evaluación del jurado de València Hack.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${fraunces.variable} ${montserrat.variable} antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
