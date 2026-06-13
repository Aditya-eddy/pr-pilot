import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  description:
    "Review your open GitHub pull requests with Codex and post native GitHub reviews.",
  title: "Codex PR Pilot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
