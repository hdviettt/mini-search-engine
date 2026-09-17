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
 * Runs from <head>, ahead of the body, and does two things before first paint.
 *
 * 1. Sets the theme, so a light-default page does not flash white for a reader
 *    who chose dark.
 * 2. Sets --vph, the true viewport height in the zoomed coordinate space.
 *    globals.css has a pure-CSS fallback; this overrides it with the measured
 *    value so the app is correct regardless of how a browser resolves `vh`
 *    under `zoom`, and stays correct when a mobile URL bar shows or hides.
 *    Nothing in this app may use 100vh / h-screen / min-h-screen — see the
 *    note in globals.css for why.
 */
const BOOT_INIT = `
try {
  var t = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
(function () {
  var de = document.documentElement;
  function vph() {
    var z = parseFloat(getComputedStyle(de).zoom) || 1;
    de.style.setProperty('--vph', (window.innerHeight / z) + 'px');
  }
  vph();
  addEventListener('resize', vph);
  addEventListener('orientationchange', vph);
})();
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
        <script dangerouslySetInnerHTML={{ __html: BOOT_INIT }} />
      </head>
      <body className={`${mono.variable} bg-[var(--bg)] text-[var(--text)]`}
        style={{ minHeight: "var(--vph)" }}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
