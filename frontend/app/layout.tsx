import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VietSearch — Football Search Engine",
  description: "A mini search engine with AI Overviews, built from scratch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0a0a1a] text-gray-200 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
