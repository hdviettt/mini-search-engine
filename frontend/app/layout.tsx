import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Search Engine Playground",
  description: "Interactive search engine with AI Overviews — built from scratch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} bg-[var(--bg)] text-[var(--text)] min-h-screen font-mono`}>
        {children}
      </body>
    </html>
  );
}
