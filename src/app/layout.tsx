import type { Metadata } from "next";
import { Urbanist, JetBrains_Mono, Newsreader } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ThemeProvider } from "@/reviz/ThemeProvider";

const sans = Urbanist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "reviz — research visualization library",
    template: "%s · reviz",
  },
  description:
    "The world's largest library of research-grade, themeable, animated visualization components. Built for teams who present findings.",
  keywords: [
    "data visualization",
    "research",
    "charts",
    "react components",
    "scientific figures",
    "machine learning",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
