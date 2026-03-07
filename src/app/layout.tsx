import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = {
  title: "Drive Sync",
  description: "Mobile mechanic shop management — clients, vehicles, and work orders.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Drive Sync",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-garage-950 text-garage-50 min-h-screen`}
      >
        {/* Main content area — padded at the bottom to clear the fixed nav bar */}
        <main style={{ paddingBottom: "var(--mobile-nav-height)" }}>{children}</main>

        {/* Persistent bottom navigation bar */}
        <MobileNav />
      </body>
    </html>
  );
}
