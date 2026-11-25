import { sentenceSpans } from "./claims";
import type { FetchLike, SourceText } from "./types";

/** Build the Europe PMC search URL for a quoted DOI. */
export function europePmcSearchUrl(doi: string): string {
  return `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&resultType=lite`;
}

/** Build the Europe PMC full text XML URL for a PMCID. */
export function europePmcFullTextUrl(pmcid: string): string {
  return `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`;
}

/** Maximum number of characters retained from full text. */
export const MAX_FULL_TEXT_CHARS = 120000;

/** Unicode paragraph separator, used only to mark block edges while reading. */
const BLOCK_BREAK = "\u2029";

const EXCLUDED = "ref-list, table-wrap, fig, supplementary-material, back";

/** Read abstract and body paragraphs from JATS, excluding ancillary matter. */
export function extractJatsText(
  xml: string,
  parse: (xml: string) => Document = (x) =>
    new DOMParser().parseFromString(x, "application/xml"),
): string {
  const document = parse(xml);
  if (document.querySelector("parsererror") !== null) return "";

  return [
    ...document.querySelectorAll("front abstract p"),
    ...document.querySelectorAll("body p"),
  ]
    .filter((paragraph) => paragraph.closest(EXCLUDED) === null)
    // A paragraph inside another (in a list, say) is read as part of the outer one.
    .filter((paragraph) => paragraph.parentElement?.closest("p") == null)
    .map((paragraph) => {
      // A figure or table can sit inside a paragraph; drop it before reading the text.
      const copy = paragraph.cloneNode(true) as Element;
      copy.querySelectorAll(EXCLUDED).forEach((node) => node.remove());
      // A reference number glued to a full stop ("minutes.1") would hide the
      // sentence boundary; write it as a spaced marker ("minutes. [1]").
      copy.querySelectorAll('xref[ref-type="bibr"]').forEach((xref) => {
        const label = (xref.textContent ?? "").trim().replace(/^\[|\]$/g, "");
        if (/^[\d\s,\u2013-]+$/.test(label)) xref.textContent = ` [${label}]`;
      });
      // Flattening script markup would turn 10 to the sixth into 106.
      // Use explicit notation, except for raised bibliography markers.
      for (const script of [...copy.querySelectorAll("sup, sub")].reverse()) {
        if (script.closest('xref[ref-type="bibr"]')) continue;
        const citations = [...script.querySelectorAll('xref[ref-type="bibr"]')];
        const remainder = document.createElement("span");
        remainder.append(script.cloneNode(true));
        remainder.querySelectorAll('xref[ref-type="bibr"]').forEach((xref) => xref.remove());
        if (citations.length > 0 && /^[\s,;[\]\u2013-]*$/.test(remainder.textContent ?? "")) {
          const labels = citations.map((xref) => (xref.textContent ?? "").trim().replace(/^\[|\]$/g, ""));
          script.replaceWith(` [${labels.join(", ")}]`);
        } else {
          const marker = script.localName === "sup" ? "^" : "_";
          script.replaceWith(`${marker}(${(script.textContent ?? "").trim()})`);
        }
      }
      // A nested block (a list, a paragraph in a paragraph) is a paragraph of
      // its own: mark both sides, then split there, so the boundary survives
      // the whitespace clean-up below.
      copy.querySelectorAll("p, list-item, list").forEach((block) => {
        block.prepend(BLOCK_BREAK);
        block.append(BLOCK_BREAK);
      });
      return (copy.textContent ?? "")
        .split(BLOCK_BREAK)
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter((part) => part !== "")
        .join("\n\n");
    })
    .filter((text) => text !== "")
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fetch open-access full text for a DOI or explain why it is unavailable. */
export async function fetchFullTextByDoi(
  doi: string,
  fetchImpl: FetchLike,
  parse?: Parameters<typeof extractJatsText>[1],
): Promise<SourceText> {
  let response: Response;
  try {
    response = await fetchImpl(europePmcSearchUrl(doi));
  } catch {
    return { status: "unreachable", reason: "Could not reach Europe PMC." };
  }
  if (!response.ok) {
    return { status: "unreachable", reason: `Europe PMC answered HTTP ${response.status}.` };
  }

  const unreadableReply: SourceText = {
    status: "unreachable",
    reason: "Europe PMC sent a reply that could not be read.",
  };
  let reply: unknown;
  try {
    reply = await response.json();
  } catch {
    return unreadableReply;
  }
  if (!isRecord(reply) || !isRecord(reply.resultList) || !Array.isArray(reply.resultList.result)) {
    return unreadableReply;
  }
  const results: unknown[] = reply.resultList.result;
  const match = results.find((result) =>
    isRecord(result) && result.isOpenAccess === "Y" && typeof result.pmcid === "string",
  );
  if (!isRecord(match) || typeof match.pmcid !== "string") {
    return {
      status: "unreachable",
      reason: "Europe PMC has no open-access full text for this DOI.",
    };
  }

  try {
    response = await fetchImpl(europePmcFullTextUrl(match.pmcid));
  } catch {
    return { status: "unreachable", reason: "Could not reach Europe PMC." };
  }
  if (!response.ok) {
    return { status: "unreachable", reason: `Europe PMC answered HTTP ${response.status}.` };
  }

  const unreadableText: SourceText = {
    status: "unreachable",
    reason: "Europe PMC full text could not be read.",
  };
  let text: string;
  try {
    text = extractJatsText(await response.text(), parse);
  } catch {
    return unreadableText;
  }
  if (text === "") return unreadableText;
  if (text.length > MAX_FULL_TEXT_CHARS) {
    const boundary = text.lastIndexOf("\n\n", MAX_FULL_TEXT_CHARS - 1);
    // Split the original text, never a cut prefix whose last fragment would
    // look like a whole sentence after losing its trailing qualification.
    const end = boundary === -1
      ? sentenceSpans(text).filter((span) => span.end <= MAX_FULL_TEXT_CHARS).at(-1)?.end
      : boundary;
    if (end === undefined || end === 0) {
      return { status: "unreachable", reason: "Europe PMC full text has no complete sentence within the length limit." };
    }
    return {
      status: "ok",
      text: text.slice(0, end),
      origin: "europepmc",
      truncated: true,
    };
  }
  return { status: "ok", text, origin: "europepmc" };
}
