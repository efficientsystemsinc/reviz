"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Check, Copy, Quote } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Figure,
  cn,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type CiteStyle = "apa" | "inline";

export interface CitationBlockProps {
  authors?: string;
  year?: string;
  title?: string;
  venue?: string;
  url?: string;
  style?: CiteStyle;
  accent?: string;
  caption?: string;
  source?: string;
  duration?: number;
  /** Figure title (chrome above the citation). */
  figureTitle?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Detect whether a url is a DOI, an arXiv id/link, or a plain link. */
function classifyLink(url: string): { kind: "doi" | "arxiv" | "link" | "none"; label: string; href: string } {
  const u = url.trim();
  if (!u) return { kind: "none", label: "", href: "" };

  const lower = u.toLowerCase();
  if (lower.includes("arxiv")) {
    const id = u.replace(/^.*arxiv\.org\/(abs|pdf)\//i, "").replace(/^arxiv:/i, "").replace(/\.pdf$/i, "");
    return {
      kind: "arxiv",
      label: `arXiv:${id}`,
      href: /^https?:/i.test(u) ? u : `https://arxiv.org/abs/${id}`,
    };
  }
  if (lower.includes("doi") || /^10\.\d{4,9}\//.test(u)) {
    const id = u.replace(/^.*doi\.org\//i, "").replace(/^doi:/i, "");
    return {
      kind: "doi",
      label: `doi:${id}`,
      href: /^https?:/i.test(u) ? u : `https://doi.org/${id}`,
    };
  }
  return {
    kind: "link",
    label: u.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
    href: /^https?:/i.test(u) ? u : `https://${u}`,
  };
}

/** First author's family name, lowercased, for a BibTeX key. */
function bibKey(authors: string, year: string): string {
  const first = authors.split(/,|&|\band\b/i)[0]?.trim() ?? "anon";
  const family = first.split(/\s+/).filter(Boolean).pop() ?? "anon";
  const slug = family.toLowerCase().replace(/[^a-z]/g, "") || "ref";
  return `${slug}${year.replace(/[^0-9]/g, "") || "0000"}`;
}

/** Build a clean BibTeX entry from the fields. */
function toBibtex(props: {
  authors: string;
  year: string;
  title: string;
  venue: string;
  link: ReturnType<typeof classifyLink>;
}): string {
  const { authors, year, title, venue, link } = props;
  const key = bibKey(authors, year);
  const bibAuthors = authors
    .split(/,|&/)
    .map((a) => a.trim())
    .filter(Boolean)
    .join(" and ");
  const lines = [
    `@article{${key},`,
    `  author  = {${bibAuthors || authors}},`,
    `  title   = {${title}},`,
    venue ? `  journal = {${venue}},` : "",
    `  year    = {${year}},`,
    link.kind === "doi" ? `  doi     = {${link.label.replace(/^doi:/i, "")}},` : "",
    link.kind === "arxiv" ? `  eprint  = {${link.label.replace(/^arxiv:/i, "")}},` : "",
    link.kind === "arxiv" ? `  archivePrefix = {arXiv},` : "",
    link.kind === "link" && link.href ? `  url     = {${link.href}},` : "",
    `}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function CitationBlock({
  authors = "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I.",
  year = "2017",
  title = "Attention Is All You Need",
  venue = "Advances in Neural Information Processing Systems (NeurIPS)",
  url = "arXiv:1706.03762",
  style = "apa",
  accent = "",
  caption = "",
  source = "",
  duration = 800,
  figureTitle = "",
}: CitationBlockProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [copied, setCopied] = useState(false);

  const ids = useMemo(() => ({ status: uid("cite-status") }), []);
  const link = useMemo(() => classifyLink(url), [url]);
  const bibtex = useMemo(
    () => toBibtex({ authors, year, title, venue, link }),
    [authors, year, title, venue, link],
  );

  const inline = style === "inline";
  const show = reduced || inView;
  const dur = Math.max(0, duration) / 1000;

  async function copyCite() {
    try {
      await navigator.clipboard.writeText(bibtex);
    } catch {
      /* clipboard may be unavailable; still flash confirmation */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  // Shared transition for the staggered reveal.
  const reveal = (i: number) => ({
    initial: false as const,
    animate: { opacity: show ? 1 : 0, y: show ? 0 : 8 },
    transition: {
      duration: reduced ? 0 : Math.min(0.6, Math.max(0.28, dur)),
      delay: reduced ? 0 : 0.06 + i * 0.07,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  });

  return (
    <Figure variant="plain" align="left" title={figureTitle} caption={caption} source={source}>
      <motion.div
        ref={ref}
        className={cn(
          "group/cite relative isolate w-full max-w-2xl overflow-hidden rounded-reviz border border-border bg-surface",
          inline ? "px-5 py-4" : "px-6 py-5 sm:px-7 sm:py-6",
        )}
        initial={false}
        animate={{ opacity: show ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : Math.min(0.5, dur) }}
      >
        {/* Accent spine on the left edge */}
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] origin-top"
          style={{ background: `linear-gradient(to bottom, ${fill}, ${withAlpha(fill, 0.2)})` }}
          initial={false}
          animate={{ scaleY: show ? 1 : 0, opacity: show ? 1 : 0 }}
          transition={{ duration: reduced ? 0 : Math.min(0.7, dur), ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Decorative oversized quote glyph — kept tight in the corner so it sits clear of the text */}
        <Quote
          aria-hidden
          className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 -z-10"
          strokeWidth={1.25}
          style={{ color: withAlpha(fill, 0.07) }}
        />

        {inline ? (
          /* ----- Inline style: a single flowing reference line ----- */
          <motion.p className="font-serif text-[15px] leading-relaxed text-ink" {...reveal(0)}>
            <span className="font-medium not-italic">{authors}</span>
            {authors && " "}
            <span className="text-ink-muted">({year}).</span>{" "}
            <span className="font-semibold not-italic" style={{ color: p.ink }}>
              {title}
            </span>
            {title && !/[.?!]$/.test(title.trim()) ? "." : ""}{" "}
            {venue && <span className="italic text-ink-muted">{venue}.</span>}
            {link.kind !== "none" && (
              <>
                {" "}
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-[12px] not-italic underline decoration-dotted underline-offset-2 transition-colors"
                  style={{ color: fill }}
                >
                  {link.label}
                </a>
              </>
            )}
          </motion.p>
        ) : (
          /* ----- APA / block style: structured stacked fields ----- */
          <div className="flex flex-col gap-2">
            {/* Authors · Year — pad the right so the line clears the corner quote glyph */}
            <motion.div
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-10"
              {...reveal(0)}
            >
              <span className="font-serif text-[14px] leading-snug text-ink">{authors}</span>
              <span
                className="font-mono text-[11px] uppercase tracking-label"
                style={{ color: withAlpha(fill, 0.95) }}
              >
                {year}
              </span>
            </motion.div>

            {/* Title — emphasized */}
            <motion.h3
              className="font-serif text-[19px] font-semibold leading-snug tracking-tight text-ink sm:text-[21px]"
              {...reveal(1)}
            >
              {title}
            </motion.h3>

            {/* Venue — italic serif */}
            {venue && (
              <motion.p
                className="font-serif text-[13.5px] italic leading-snug text-ink-muted"
                {...reveal(2)}
              >
                {venue}
              </motion.p>
            )}

            {/* Link + cite action row */}
            <motion.div
              className="mt-2 flex flex-wrap items-center justify-between gap-3"
              {...reveal(3)}
            >
              {link.kind !== "none" ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-alt/50 px-2.5 py-1 font-mono text-[11px] uppercase tracking-label text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                  style={{ borderColor: withAlpha(fill, 0.3) }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: fill }}
                  />
                  {link.label}
                  <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                </a>
              ) : (
                <span />
              )}

              <CiteButton copied={copied} onClick={copyCite} fill={fill} statusId={ids.status} />
            </motion.div>
          </div>
        )}

        {/* Inline style keeps a floating cite button in the corner */}
        {inline && (
          <div className="mt-3 flex justify-end">
            <CiteButton copied={copied} onClick={copyCite} fill={fill} statusId={ids.status} />
          </div>
        )}
      </motion.div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Cite button                                                        */
/* ------------------------------------------------------------------ */

function CiteButton({
  copied,
  onClick,
  fill,
  statusId,
}: {
  copied: boolean;
  onClick: () => void;
  fill: string;
  statusId: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      aria-describedby={statusId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5",
        "font-mono text-[10.5px] uppercase tracking-label transition-colors",
      )}
      style={{
        borderColor: copied ? withAlpha(fill, 0.55) : withAlpha(fill, 0.32),
        background: copied ? withAlpha(fill, 0.12) : withAlpha(fill, 0.06),
        color: fill,
      }}
    >
      {copied ? (
        <Check className="h-3 w-3" strokeWidth={2.5} />
      ) : (
        <Copy className="h-3 w-3" strokeWidth={2} />
      )}
      <span id={statusId}>{copied ? "Copied BibTeX" : "Cite"}</span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "citation-block",
  name: "Citation Block",
  category: "layout-annotation",
  description:
    "A research-grade reference block — authors, year, emphasized title, and italic-serif venue — with a one-click button that copies a clean BibTeX entry and smart DOI/arXiv link styling.",
  tags: ["citation", "reference", "bibtex", "academic", "annotation", "doi", "arxiv"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "CitationBlock",
  sourcePath: "layout-annotation/CitationBlock",
  aspect: 16 / 7,
  controls: [
    {
      key: "authors",
      label: "Authors",
      type: "textarea",
      group: "Data",
      rows: 2,
      default:
        "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I.",
    },
    { key: "year", label: "Year", type: "text", group: "Data", default: "2017" },
    { key: "title", label: "Title", type: "text", group: "Data", default: "Attention Is All You Need" },
    {
      key: "venue",
      label: "Venue",
      type: "text",
      group: "Data",
      default: "Advances in Neural Information Processing Systems (NeurIPS)",
    },
    {
      key: "url",
      label: "DOI / arXiv / URL",
      type: "text",
      group: "Data",
      default: "arXiv:1706.03762",
    },
    {
      key: "style",
      label: "Style",
      type: "select",
      group: "Layout",
      default: "apa",
      options: [
        { value: "apa", label: "APA (block)" },
        { value: "inline", label: "Inline" },
      ],
    },
    { key: "figureTitle", label: "Figure title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 800,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "transformer",
      name: "Transformer paper",
      props: {
        authors:
          "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I.",
        year: "2017",
        title: "Attention Is All You Need",
        venue: "Advances in Neural Information Processing Systems (NeurIPS)",
        url: "arXiv:1706.03762",
        style: "apa",
      },
    },
    {
      id: "alphafold",
      name: "AlphaFold (DOI)",
      props: {
        authors: "Jumper, J., Evans, R., Pritzel, A., Green, T., Figurnov, M., & Hassabis, D.",
        year: "2021",
        title: "Highly accurate protein structure prediction with AlphaFold",
        venue: "Nature",
        url: "10.1038/s41586-021-03819-2",
        style: "apa",
        figureTitle: "Primary reference",
      },
    },
    {
      id: "inline-ref",
      name: "Inline reference",
      props: {
        authors: "Brown, T. B., et al.",
        year: "2020",
        title: "Language Models are Few-Shot Learners",
        venue: "NeurIPS",
        url: "arXiv:2005.14165",
        style: "inline",
      },
    },
  ],
};
