import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "FINN — Your investment perspective",
    template: "%s | FINN",
  },
  description:
    "A thoughtful workspace for your portfolio, important updates, and company research. Frontend prototype with fictional mock data.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
