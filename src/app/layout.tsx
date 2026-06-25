import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FSP SLE Trainer – Prototyp",
  description:
    "Lokaler Fachsprachprüfungs-Trainingsprototyp mit deterministischer SLE-Fallsimulation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
