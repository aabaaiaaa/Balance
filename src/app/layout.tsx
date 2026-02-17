import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { AppShell } from "@/components/AppShell";
import { AppInitializer } from "@/components/AppInitializer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeScript } from "@/components/ThemeScript";

export const metadata: Metadata = {
  title: "Balance",
  description:
    "Stay intentionally connected with the people who matter and keep your life in balance.",
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Balance",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link
          rel="apple-touch-icon"
          href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/icon-192x192.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/icon-152x152.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="144x144"
          href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/icon-144x144.png`}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <UpdatePrompt />
          <AppInitializer>
            <AppShell>{children}</AppShell>
          </AppInitializer>
        </ThemeProvider>
      </body>
    </html>
  );
}
