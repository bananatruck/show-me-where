import { describe, expect, it } from "vitest";
import css from "../styles.css?raw";

/** The custom properties declared in the first rule whose selector is exactly `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1] ?? ""] = m[2] ?? "";
  return out;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("control borders", () => {
  it.each([":root", ':root[data-theme="dark"]'])("meet 3:1 against the surface and the paper in %s", (selector) => {
    const t = tokens(selector);
    expect(t["control-border"]).toBeDefined();
    expect(ratio(t["control-border"] ?? "", t["surface"] ?? "")).toBeGreaterThanOrEqual(3);
    expect(ratio(t["control-border"] ?? "", t["paper"] ?? "")).toBeGreaterThanOrEqual(3);
  });
});
