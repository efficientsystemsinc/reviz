"use client";

import { Highlight, type PrismTheme } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/lib/exportSvg";
import { cn } from "@/lib/utils";

/** A theme that reads from reviz CSS variables so code matches the active palette. */
const revizCodeTheme: PrismTheme = {
  plain: { color: "rgb(var(--rz-ink))", backgroundColor: "transparent" },
  styles: [
    { types: ["comment"], style: { color: "rgb(var(--rz-ink-faint))", fontStyle: "italic" } },
    { types: ["keyword", "builtin"], style: { color: "rgb(var(--rz-accent))" } },
    { types: ["string", "char", "attr-value"], style: { color: "rgb(var(--rz-ok))" } },
    { types: ["number", "boolean"], style: { color: "rgb(var(--rz-warn))" } },
    { types: ["tag", "attr-name"], style: { color: "rgb(var(--rz-ink))" } },
    { types: ["punctuation", "operator"], style: { color: "rgb(var(--rz-ink-muted))" } },
    { types: ["function", "class-name"], style: { color: "rgb(var(--rz-ink))", fontWeight: "600" } },
  ],
};

export function CodePanel({ code, language = "tsx", className }: { code: string; language?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <div className={cn("group relative overflow-hidden rounded-reviz border border-border bg-surface", className)}>
      <div className="flex items-center justify-between border-b border-border bg-surface-alt/60 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">{language}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Highlight code={code} language={language} theme={revizCodeTheme}>
        {({ className: cls, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(cls, "overflow-x-auto p-4 text-[12.5px] leading-relaxed")}
            style={{ ...style, background: "transparent" }}
          >
            {tokens.map((line, i) => {
              const { key, ...lineProps } = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  <span className="mr-4 inline-block w-5 select-none text-right text-ink-faint/50">{i + 1}</span>
                  {line.map((token, j) => {
                    const { key: tk, ...tokenProps } = getTokenProps({ token });
                    return <span key={j} {...tokenProps} />;
                  })}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
