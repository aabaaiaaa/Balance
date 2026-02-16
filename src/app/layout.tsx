import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AppShell } from "@/components/AppShell";

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
    <html lang="en">
      <head>
        <link
          rel="apple-touch-icon"
          href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/icon-192x192.png`}
        />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegistration />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
