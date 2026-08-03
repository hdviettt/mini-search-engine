import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";

// Google Sans Flex is loaded via <link> rather than next/font: it is not in
// next/font's compiled family list. Same approach the blog uses, so both
// properties render in the same typeface.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Mini Search Engine",
  description: "A search engine built from scratch — crawling, indexing, BM25, PageRank, neural reranking and AI Overviews",
};

/**
 * Set the theme before first paint so a light-default page does not flash
 * white for a reader who chose dark. Runs from <head>, ahead of the body.
 */
const THEME_INIT = `
try {
  var t = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className={`${mono.variable} bg-[var(--bg)] text-[var(--text)] min-h-screen`}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
