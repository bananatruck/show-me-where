/**
 * The sample run shown to judges with no key.
 *
 * SYNTHETIC: every text below is hand-written. The authors, sources and model
 * replies are invented to show each outcome, including one reply whose quote
 * is not in the source. No model produced them, and the app says so on
 * screen. Replace this with a recorded real run before submission.
 */
export interface SampleRun {
  synthetic: boolean;
  /** Shown above the sample on screen. */
  label: string;
  text: string;
  /** Source text by reference number. A reference left out here is "not reachable". */
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
    "Synthetic example. The paragraph, the five sources and the model's replies were written by hand to show every outcome. No real model run is shown here.",
  text: [
    "Students who sleep at least seven hours score higher on memory tests (Alder & Birch, 2025).",
    "In one trial, memory scores rose by 18% after two weeks of extra sleep (Alder & Birch, 2025).",
    "Short afternoon naps improve recall as much as a full night of sleep (Cedar et al., 2024).",
    "Caffeine after 4 pm delays sleep onset (Dunmore, 2023; Ellery, 2022).",
    "Many students say they sleep less during exam weeks.",
    "Blue light from phones has no effect on sleep (Dunmore, 2023).",
    "Fernsby (2021) found that a consistent wake time improves grades.",
    "",
    "References",
    "Alder, M., & Birch, T. (2025). A synthetic study of sleep and memory in students. Synthetic Journal of Sleep, 1(1), 1-10.",
    "Cedar, J., Hollis, R., & Ng, P. (2024). A synthetic study of afternoon naps. Synthetic Journal of Sleep, 2(1), 11-20.",
    "Dunmore, L. (2023). A synthetic survey of evening habits. Synthetic Survey Reports, 3, 21-30.",
    "Ellery, S. (2022). A synthetic trial of caffeine timing. Synthetic Trials, 4, 31-40.",
    "Fernsby, K. (2021). A synthetic report on wake times. Synthetic Reports, 5, 41-50.",
  ].join("\n"),
  sources: {
    1: "We followed 120 undergraduate students for one term. Students who slept at least seven hours per night scored higher on a word-list memory test than students who slept less. In the intervention group, memory scores rose by 8% after two weeks of extra sleep. The effect was smaller in students over 25.",
    2: "Twenty-minute afternoon naps improved recall on the same day. Recall after a nap was lower than recall after a full night of sleep. Longer naps caused grogginess in some participants.",
    3: "We surveyed 640 students about their evenings. Students who drank caffeine after 4 pm took longer to fall asleep on most nights. We did not measure screen use.",
    4: "We randomly assigned 48 students to caffeine or placebo at 5 pm. In our trial, caffeine taken after 4 pm did not delay sleep onset compared with placebo. Participants who took caffeine reported feeling more alert.",
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
      "The survey reports later sleep onset after late caffeine.",
    ),
    "c4:4": reply(
      "not_supported",
      "In our trial, caffeine taken after 4 pm did not delay sleep onset compared with placebo.",
      "The trial found no delay in sleep onset.",
    ),
    "c5:3": reply("cannot_tell", "", "The source says screen use was not measured."),
  },
};
