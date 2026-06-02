import type { Metadata } from "next";
import {
  Urbanist,
  JetBrains_Mono,
  Newsreader,
  Inter,
  Space_Grotesk,
  Manrope,
  Sora,
  Plus_Jakarta_Sans,
  DM_Sans,
  IBM_Plex_Mono,
  Space_Mono,
  Spline_Sans_Mono,
  Fraunces,
  Source_Serif_4,
} from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ThemeProvider } from "@/reviz/ThemeProvider";

// Default roles
const sans = Urbanist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", style: ["normal", "italic"], display: "swap" });

// Selectable alternatives (see src/reviz/fonts.ts) — each must be its own
// module-scope const (next/font requirement). Exposed as CSS vars and applied
// per-figure by overriding the role vars inside the preview scope.
const inter = Inter({ subsets: ["latin"], variable: "--rzf-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--rzf-space-grotesk", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--rzf-manrope", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--rzf-sora", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--rzf-jakarta", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--rzf-dmsans", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--rzf-ibm-plex-mono", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--rzf-space-mono", display: "swap" });
const splineMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--rzf-spline-mono", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--rzf-fraunces", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], variable: "--rzf-source-serif", display: "swap" });
const altVars = [inter, spaceGrotesk, manrope, sora, jakarta, dmSans, ibmPlexMono, spaceMono, splineMono, fraunces, sourceSerif]
  .map((f) => f.variable)
  .join(" ");

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
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} ${altVars}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
