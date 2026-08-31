import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OptiScan Bio — 405nm Precision Biophotonic Tele-Oncology",
  description: "Point-of-care 405nm autofluorescence loss mapping for oral pre-cancer triage. Apple Health-inspired clinical interface.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-[#F5F5F7] text-[#1D1D1F] antialiased selection:bg-indigo-500/20 selection:text-indigo-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}

