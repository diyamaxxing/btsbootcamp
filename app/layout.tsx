import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTS Bootcamp",
  icons: { icon: "/favicon.png" },
};

// Deliberately minimal — no Nav, no AuthProvider, no GA4 here. /admin and
// /data (outside the (site) route group, see app/(site)/layout.tsx) are
// "obscure by URL, not auth-gated" in the original (pages/admin.html,
// pages/data.html): no nav, no auth.js, no analytics.js loaded on either.
// Every other route gets those via the (site) group's own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-base font-sans text-[14px] text-ink">{children}</body>
    </html>
  );
}
