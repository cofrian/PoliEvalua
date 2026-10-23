import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { ServiceWorkerRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { pickClientMessages } from "@/i18n/client-messages";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: {
      default: "Evalúa · UPV",
      template: "%s · Evalúa UPV",
    },
    description: t("description"),
    appleWebApp: {
      capable: true,
      title: "Evalúa UPV",
      statusBarStyle: "default",
    },
    icons: { icon: "/icons/upv-evalua.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#3f4444",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${poppins.variable} ${inter.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <NextIntlClientProvider messages={pickClientMessages(messages)}>
            <TooltipProvider>{children}</TooltipProvider>
          </NextIntlClientProvider>
          <Toaster richColors />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
