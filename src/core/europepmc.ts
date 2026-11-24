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
    .map((paragraph) => {
      // A figure or table can sit inside a paragraph; drop it before reading the text.
      const copy = paragraph.cloneNode(true) as Element;
      copy.querySelectorAll(EXCLUDED).forEach((node) => node.remove());
      return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
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
    return {
      status: "ok",
      text: text.slice(0, boundary === -1 ? MAX_FULL_TEXT_CHARS : boundary),
      origin: "europepmc",
      truncated: true,
    };
  }
  return { status: "ok", text, origin: "europepmc" };
}
