const DOI = /10\.\d{4,9}\/[^\s"<>]+/;

/** Removes punctuation that ends the sentence around a DOI but is not part of it. */
function trimDoi(doi: string): string {
  let out = doi;
  for (;;) {
    const last = out.at(-1);
    if (last === undefined) return out;
    if (".,;:".includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    const pair = last === ")" ? "(" : last === "]" ? "[" : null;
    if (pair && count(out, last) > count(out, pair)) {
      out = out.slice(0, -1);
      continue;
    }
    return out;
  }
}

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

/** Finds a DOI written bare, after "doi:", or inside a doi.org link. */
export function extractDoi(entry: string): string | null {
  const match = DOI.exec(entry);
  if (!match) return null;
  // In a Markdown link "[10.1/x](https://doi.org/10.1/x)" the DOI ends at "](".
  const doi = match[0].split("](")[0] ?? match[0];
  return trimDoi(doi);
}
