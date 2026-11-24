import { describe, expect, it } from "vitest";
import { extractDoi, parseReferences, splitDocument } from "./references";

describe("splitDocument", () => {
  it("splits body and reference list at a References heading", () => {
    const doc = "Body one [1].\n\nReferences\n[1] A. Author. Title. doi:10.1000/xyz";
    expect(splitDocument(doc)).toEqual({
      body: "Body one [1].",
      referenceList: "[1] A. Author. Title. doi:10.1000/xyz",
    });
  });

  it.each(["References:", "BIBLIOGRAPHY", "Works Cited", "  references  "])(
    "accepts the heading %j",
    (heading) => {
      const { body, referenceList } = splitDocument(`Text [1].\n${heading}\n[1] X.`);
      expect(body).toBe("Text [1].");
      expect(referenceList).toBe("[1] X.");
    },
  );

  it("does not treat the word inside a sentence as a heading", () => {
    const doc = "The references in [1] are old.";
    expect(splitDocument(doc)).toEqual({ body: doc, referenceList: "" });
  });

  it("uses the last heading when the word appears twice as a heading", () => {
    const doc = "References\nis a word.\nReferences\n[1] X.";
    expect(splitDocument(doc).referenceList).toBe("[1] X.");
  });
});

describe("extractDoi", () => {
  it("finds a bare DOI", () => {
    expect(extractDoi("Title. 10.1371/journal.pone.0000217")).toBe(
      "10.1371/journal.pone.0000217",
    );
  });

  it("finds a DOI after doi:", () => {
    expect(extractDoi("Title. doi:10.1038/nature14539.")).toBe("10.1038/nature14539");
  });

  it("finds a DOI inside a doi.org link and strips trailing punctuation", () => {
    expect(extractDoi("(see https://doi.org/10.1000/abc-1(2)x);")).toBe("10.1000/abc-1(2)x");
  });

  it("returns null when there is no DOI", () => {
    expect(extractDoi("A. Author. A book. Publisher, 2020.")).toBeNull();
  });
});

describe("parseReferences", () => {
  it("parses numbered entries with continuation lines", () => {
    const list = [
      "[1] A. Author. First paper.",
      "    Journal, 2020. doi:10.1000/one",
      "[2] B. Author. Second paper. No DOI.",
    ].join("\n");
    expect(parseReferences(list)).toEqual([
      {
        number: 1,
        raw: "A. Author. First paper. Journal, 2020. doi:10.1000/one",
        doi: "10.1000/one",
      },
      { number: 2, raw: "B. Author. Second paper. No DOI.", doi: null },
    ]);
  });

  it("ignores text before the first numbered entry", () => {
    expect(parseReferences("Some note\n[3] C.")).toEqual([
      { number: 3, raw: "C.", doi: null },
    ]);
  });

  it("returns an empty list for an empty reference list", () => {
    expect(parseReferences("")).toEqual([]);
  });
});
