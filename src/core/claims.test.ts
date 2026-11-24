import { describe, expect, it } from "vitest";
import { extractClaims, parseMarkers, splitSentences } from "./claims";

describe("splitSentences", () => {
  it("splits on sentence-ending punctuation followed by a capital", () => {
    expect(splitSentences("One is here. Two is here! Three? Four.")).toEqual([
      "One is here.",
      "Two is here!",
      "Three?",
      "Four.",
    ]);
  });

  it("does not split after common abbreviations or initials", () => {
    expect(
      splitSentences("Smith et al. Found it, e.g. In mice. Prof. Lee and J. Doe agree. Next."),
    ).toEqual(["Smith et al. Found it, e.g. In mice.", "Prof. Lee and J. Doe agree.", "Next."]);
  });

  it("does not split inside decimal numbers", () => {
    expect(splitSentences("It rose 7.1 percent. Then fell.")).toEqual([
      "It rose 7.1 percent.",
      "Then fell.",
    ]);
  });

  it("keeps a marker placed after the full stop with its sentence", () => {
    expect(splitSentences("It rose.[1] Then fell [2].")).toEqual(["It rose.[1]", "Then fell [2]."]);
  });

  it("always splits at a blank line", () => {
    expect(splitSentences("A heading\n\nThe text.")).toEqual(["A heading", "The text."]);
  });

  it("returns nothing for blank input", () => {
    expect(splitSentences("  \n ")).toEqual([]);
  });
});

describe("parseMarkers", () => {
  const known = new Set([1, 2, 3, 4]);

  it("reads single, list and range markers", () => {
    expect(parseMarkers("A [1] and B [2, 4] and C [1-3].", known)).toEqual({
      refs: [1, 2, 3, 4],
      text: "A and B and C.",
    });
  });

  it("accepts an en dash in a range", () => {
    expect(parseMarkers("A [2\u20133].", known).refs).toEqual([2, 3]);
  });

  it("leaves a bracketed number that is not a known reference as text", () => {
    expect(parseMarkers("In [2019] it rose [1].", known)).toEqual({
      refs: [1],
      text: "In [2019] it rose.",
    });
  });

  it("returns no refs when there are no markers", () => {
    expect(parseMarkers("Plain sentence.", known)).toEqual({
      refs: [],
      text: "Plain sentence.",
    });
  });

  it("ignores a reversed or oversized range", () => {
    expect(parseMarkers("A [3-1] B [1-999].", known)).toEqual({
      refs: [],
      text: "A [3-1] B [1-999].",
    });
  });
});

describe("extractClaims", () => {
  it("returns cited sentences as claims and lists uncited ones", () => {
    const body =
      "Sleep improves memory [1]. This matters for students. Naps help too [2, 3].";
    expect(extractClaims(body, new Set([1, 2, 3]))).toEqual({
      claims: [
        {
          id: "c1",
          text: "Sleep improves memory.",
          sentence: "Sleep improves memory [1].",
          refs: [1],
        },
        {
          id: "c2",
          text: "Naps help too.",
          sentence: "Naps help too [2, 3].",
          refs: [2, 3],
        },
      ],
      uncited: ["This matters for students."],
    });
  });
});
