import type { Metadata, Viewport } from "next";
import { Fraunces, Montserrat } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
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
  appleWebApp: { capable: true, title: "VLC Hack Jurado", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1f2557",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${montserrat.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
