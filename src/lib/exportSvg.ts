/**
 * Figure export helpers. reviz figures are SVG-first, so we can offer crisp,
 * vector SVG downloads and high-DPI PNG rasterization — something every research
 * team needs for papers and slides, and a pain to wire up by hand.
 */

function inlineComputedStyles(source: SVGSVGElement, clone: SVGSVGElement) {
  const srcNodes = source.querySelectorAll<SVGElement>("*");
  const cloneNodes = clone.querySelectorAll<SVGElement>("*");
  const props = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "letter-spacing",
    "text-anchor",
    "dominant-baseline",
    "color",
  ];
  for (let i = 0; i < srcNodes.length; i++) {
    const cs = getComputedStyle(srcNodes[i]);
    const target = cloneNodes[i];
    if (!target) continue;
    let style = "";
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (v) style += `${p}:${v};`;
    }
    target.setAttribute("style", style);
  }
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);
  const bbox = svg.viewBox.baseVal;
  if (bbox && bbox.width) {
    clone.setAttribute("width", String(bbox.width));
    clone.setAttribute("height", String(bbox.height));
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadSvg(svg: SVGSVGElement, filename = "reviz-figure.svg") {
  const data = serializeSvg(svg);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadPng(
  svg: SVGSVGElement,
  filename = "reviz-figure.png",
  scale = 3,
  background?: string,
) {
  const data = serializeSvg(svg);
  const vb = svg.viewBox.baseVal;
  const w = (vb && vb.width) || svg.clientWidth || 800;
  const h = (vb && vb.height) || svg.clientHeight || 500;
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => {
        if (!b) return reject(new Error("toBlob failed"));
        const purl = URL.createObjectURL(b);
        triggerDownload(purl, filename);
        setTimeout(() => URL.revokeObjectURL(purl), 4000);
        resolve();
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
