/**
 * The sample run shown to judges with no key.
 *
 * SYNTHETIC: every text below is hand-written. The sources are invented, and
 * the model replies were written by hand to show each outcome, including one
 * reply whose quote is not in the source. No model produced them. The app says
 * so on screen. Replace this with a recorded real run before submission.
 */
export interface SampleRun {
  synthetic: boolean;
  /** Shown above the sample on screen. */
  label: string;
  text: string;
  /** Source text by reference number. */
  sources: Readonly<Record<number, string>>;
  /** Model replies by "<claim id>:<reference number>". */
  replies: Readonly<Record<string, string>>;
}

function reply(grade: string, evidence: string, reason: string): string {
  return JSON.stringify({ grade, evidence, reason });
}

export const SAMPLE_RUN: SampleRun = {
  synthetic: true,
  label:
    "Synthetic example: the paragraph, the sources and the model replies were written by hand to show how the checker works. No real model run is shown.",
  text: [
    "Students who sleep at least seven hours score higher on memory tests [1].",
    "In one trial, memory scores rose by 18% after two weeks of extra sleep [1].",
    "Short afternoon naps improve recall as much as a full night of sleep [2].",
    "Caffeine after 4 pm delays sleep onset in most students [3].",
    "Many students say they sleep less during exam weeks.",
    "Blue light from phones has no effect on sleep [3].",
    "",
    "References",
    "[1] Example Author A. A synthetic study of sleep and memory in students. Synthetic Journal, 2025.",
    "[2] Example Author B. A synthetic study of afternoon naps. Synthetic Journal, 2024.",
    "[3] Example Author C. A synthetic survey of evening habits. Synthetic Journal, 2023.",
  ].join("\n"),
  sources: {
    1: "We followed 120 undergraduate students for one term. Students who slept at least seven hours per night scored higher on a word-list memory test than students who slept less. In the intervention group, memory scores rose by 8% after two weeks of extra sleep. The effect was smaller in students over 25.",
    2: "Twenty-minute afternoon naps improved recall on the same day. Recall after a nap was lower than recall after a full night of sleep. Longer naps caused grogginess in some participants.",
    3: "Students who drank caffeine after 4 pm took longer to fall asleep on most nights. We did not measure screen use.",
  },
  replies: {
    "c1:1": reply(
      "supported",
      "Students who slept at least seven hours per night scored higher on a word-list memory test than students who slept less.",
      "The source reports the same link between seven hours of sleep and memory scores.",
    ),
    "c2:1": reply(
      "partly_supported",
      "In the intervention group, memory scores rose by 8% after two weeks of extra sleep.",
      "The source reports a rise of 8%, not 18%.",
    ),
    // This reply quotes a sentence that is not in source 2, so the app discards it.
    "c3:2": reply(
      "supported",
      "Short afternoon naps improved recall as much as a full night of sleep.",
      "The source says naps match a full night of sleep.",
    ),
    "c4:3": reply(
      "supported",
      "Students who drank caffeine after 4 pm took longer to fall asleep on most nights.",
      "The source reports later sleep onset after late caffeine.",
    ),
    "c5:3": reply("cannot_tell", "", "The source says screen use was not measured."),
  },
};
