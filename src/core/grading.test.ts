import { describe, expect, it } from "vitest";
import { REASONS, buildPrompt, headlineGrade, judgeReply, parseModelReply } from "./grading";

const SOURCE =
  "Participants slept 7.1 hours on average. Memory scores rose by 8% after two weeks of extra sleep.";

function reply(grade: string, evidence: string, reason = "Short reason."): string {
  return JSON.stringify({ grade, evidence, reason });
}

describe("parseModelReply", () => {
  it.each(["supported", "partly_supported", "not_supported", "cannot_tell"])(
    "reads a valid %s reply",
    (grade) => {
      const parsed = parseModelReply(reply(grade, "Some quote here", "Why."));
      expect(parsed?.grade).toBe(grade);
      expect(parsed?.reason).toBe("Why.");
    },
  );

  it("reads JSON inside a code fence", () => {
    const raw = "```json\n" + reply("supported", "Participants slept 7.1 hours on average.") + "\n```";
    expect(parseModelReply(raw)?.grade).toBe("supported");
  });

  it("clears the evidence of a cannot_tell reply", () => {
    expect(parseModelReply(reply("cannot_tell", "anything"))?.evidence).toBe("");
  });

  it("rejects invalid JSON", () => {
    expect(parseModelReply("The claim is supported.")).toBeNull();
  });

  it("rejects an unknown grade", () => {
    expect(parseModelReply(reply("source_not_reachable", ""))).toBeNull();
    expect(parseModelReply(reply("probably", ""))).toBeNull();
  });

  it("rejects a reply whose fields have the wrong types", () => {
    expect(parseModelReply(JSON.stringify({ grade: "supported", evidence: 3 }))).toBeNull();
  });
});

describe("judgeReply", () => {
  it("keeps a grade whose quote occurs in the source", () => {
    const quote = "Participants slept 7.1 hours on average.";
    expect(judgeReply(reply("supported", quote, "Same number."), SOURCE)).toEqual({
      grade: "supported",
      evidence: quote,
      reason: "Same number.",
      discarded: null,
    });
  });

  it("discards a grade whose quote is not in the source", () => {
    const quote = "Memory scores rose by 18% after two weeks of extra sleep.";
    expect(judgeReply(reply("supported", quote), SOURCE)).toEqual({
      grade: "cannot_tell",
      evidence: null,
      reason: REASONS.quoteNotFound,
      discarded: { grade: "supported", evidence: quote },
    });
  });

  it("discards a not_supported grade whose quote is too short", () => {
    expect(judgeReply(reply("not_supported", "7.1 hours"), SOURCE)).toEqual({
      grade: "cannot_tell",
      evidence: null,
      reason: REASONS.quoteTooShort,
      discarded: { grade: "not_supported", evidence: "7.1 hours" },
    });
  });

  it("keeps cannot_tell without evidence", () => {
    expect(judgeReply(reply("cannot_tell", "", "Not covered."), SOURCE)).toEqual({
      grade: "cannot_tell",
      evidence: null,
      reason: "Not covered.",
      discarded: null,
    });
  });

  it("turns an unreadable reply into cannot_tell", () => {
    expect(judgeReply("Yes, supported.", SOURCE)).toEqual({
      grade: "cannot_tell",
      evidence: null,
      reason: REASONS.unreadable,
      discarded: null,
    });
  });
});

describe("headlineGrade", () => {
  it("picks the best evidenced grade across sources", () => {
    expect(headlineGrade(["cannot_tell", "partly_supported", "not_supported"])).toBe(
      "partly_supported",
    );
    expect(headlineGrade(["source_not_reachable", "cannot_tell"])).toBe("cannot_tell");
    expect(headlineGrade(["source_not_reachable"])).toBe("source_not_reachable");
  });

  it("is source_not_reachable for an empty list", () => {
    expect(headlineGrade([])).toBe("source_not_reachable");
  });
});

describe("buildPrompt", () => {
  it("puts the rubric in the system prompt and the claim and source in the user prompt", () => {
    const { system, user } = buildPrompt("Sleep helps memory.", SOURCE);
    for (const grade of ["supported", "partly_supported", "not_supported", "cannot_tell"]) {
      expect(system).toContain(grade);
    }
    expect(system).toContain("copied exactly");
    expect(user).toContain("Sleep helps memory.");
    expect(user).toContain(SOURCE);
  });
});
