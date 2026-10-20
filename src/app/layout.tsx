import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const poppins = Poppins({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Evalúa · UPV",
    template: "%s · Evalúa UPV",
  },
  description:
    "Plataforma para crear y gestionar evaluaciones de proyectos, asignaturas, premios y hackathones.",
  appleWebApp: {
    capable: true,
    title: "Evalúa UPV",
    statusBarStyle: "default",
  },
  icons: { icon: "/icons/upv-evalua.svg" },
};

export const viewport: Viewport = {
  themeColor: "#3f4444",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${poppins.variable} ${inter.variable} font-sans antialiased`}
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
