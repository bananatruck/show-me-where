// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { REASONS } from "./core/grading";
import { SAMPLE_RUN } from "./fixtures/sample";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

function goLive(text: string) {
  fireEvent.click(screen.getByRole("radio", { name: "Live with your key" }));
  fireEvent.change(screen.getByLabelText("Text to check"), { target: { value: text } });
}

describe("App", () => {
  it("labels the sample run as synthetic", () => {
    render(<App />);
    expect(screen.getByRole("note").textContent).toContain(SAMPLE_RUN.label);
  });

  it("runs the sample end to end with no key", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));

    const claims = screen.getByRole("list", { name: "Cited claims" });
    expect(within(claims).getAllByRole("listitem")).toHaveLength(6);
    expect(claims.textContent).toContain("Alder & Birch, 2025");
    const uncited = screen.getByRole("list", { name: "Not checked: no citation" });
    expect(uncited.textContent).toContain("Many students say they sleep less during exam weeks.");

    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    const results = await screen.findByRole("list", { name: "Results" });
    const items = Array.from(results.children);
    expect(items.map((li) => li.getAttribute("data-grade"))).toEqual([
      "supported",
      "partly_supported",
      "cannot_tell",
      "sources_disagree",
      "cannot_tell",
      "source_not_reachable",
    ]);
    expect(items[0]?.textContent).toContain("Supported, in the model's reading");
    expect(items[1]?.querySelector("mark")?.textContent).toBe(
      "In the intervention group, memory scores rose by 8% after two weeks of extra sleep.",
    );
    expect(items[1]?.textContent).toContain("The claim says 18%, which is not in the quoted sentence.");
    expect(items[2]?.textContent).toContain(REASONS.quoteNotFound);
    expect(items[2]?.querySelector("s")?.textContent).toContain("Supported, quoting");
    expect(items[3]?.textContent).toContain("Sources disagree");
    expect(items[5]?.textContent).toContain("The sample has no text for this source.");
    expect(screen.getByText("Hand-written replies (synthetic sample)")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
  });

  it("asks for text when the box is empty", () => {
    render(<App />);
    goLive("   ");
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    expect(screen.getByRole("alert").textContent).toContain("Paste a paragraph and its reference list first.");
  });

  it("says when no cited sentences are found", () => {
    render(<App />);
    goLive("Sleep matters (Smith, 2019).\nReferences\nLee, C. (2020). A paper.");
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    const alert = screen.getByRole("alert").textContent;
    expect(alert).toContain("No cited sentences found.");
    expect(alert).toContain("match nothing in your reference list: Smith, 2019.");
  });

  it("says when there is no reference list", () => {
    render(<App />);
    goLive("Sleep matters (Smith, 2020).");
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    expect(screen.getByRole("alert").textContent).toContain("No reference list found.");
  });

  it("asks for a key before a live check", async () => {
    render(<App />);
    goLive("A holds [1].\nReferences\n[1] X.");
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Enter your OpenRouter key");
  });

  it("refuses a model id that is not free in live mode", async () => {
    render(<App />);
    goLive("A holds [1].\nReferences\n[1] X.");
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "k" } });
    fireEvent.change(screen.getByLabelText("Model id"), { target: { value: "vendor/paid-model" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    expect((await screen.findByRole("alert")).textContent).toContain(":free");
  });

  it("keeps the key only in memory and wipes keys stored by earlier versions", () => {
    window.localStorage.setItem("claim-check.openrouter-key", "old");
    window.sessionStorage.setItem("claim-check.openrouter-key", "old");
    render(<App />);
    expect(window.localStorage.getItem("claim-check.openrouter-key")).toBeNull();
    expect(window.sessionStorage.getItem("claim-check.openrouter-key")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Live with your key" }));
    expect((screen.getByLabelText("OpenRouter key") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "abc" } });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(screen.queryByLabelText("Remember on this device")).toBeNull();
  });

  it("forgets the key when switching back to the sample run", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "Live with your key" }));
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("radio", { name: "Sample run" }));
    fireEvent.click(screen.getByRole("radio", { name: "Live with your key" }));
    expect((screen.getByLabelText("OpenRouter key") as HTMLInputElement).value).toBe("");
  });

  it("switches to the dark theme and remembers it", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("show-me-where.theme")).toBe("dark");
  });

  it("ignores a check that finishes after the text was replaced", async () => {
    let answer: (response: Response) => void = () => {};
    vi.spyOn(window, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    render(<App />);
    goLive("First claim holds [1].\nReferences\n[1] First source.");
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.change(screen.getByLabelText("Source text for [1]"), {
      target: { value: "The first source says the first claim holds." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    await vi.waitFor(() => expect(window.fetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Text to check"), {
      target: { value: "Second claim holds [1].\nReferences\n[1] Second source." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    answer(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ grade: "cannot_tell", evidence: "", reason: "r" }) } }],
        }),
        { status: 200 },
      ),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("list", { name: "Results" })).toBeNull();
    expect(screen.getByRole("button", { name: "Check claims" }).hasAttribute("disabled")).toBe(false);
  });

  it("clears pasted source text when the document changes", () => {
    render(<App />);
    goLive("First claim holds [1].\nReferences\n[1] First source.");
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.change(screen.getByLabelText("Source text for [1]"), { target: { value: "old text" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    expect((screen.getByLabelText("Source text for [1]") as HTMLTextAreaElement).value).toBe("old text");

    fireEvent.change(screen.getByLabelText("Text to check"), {
      target: { value: "Second claim holds [1].\nReferences\n[1] Second source." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    expect((screen.getByLabelText("Source text for [1]") as HTMLTextAreaElement).value).toBe("");
  });

  it("says which services were already contacted when the key is rejected", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "No auth credentials found", code: 401 } }), { status: 401 }),
    );
    render(<App />);
    goLive("First claim holds [1].\nReferences\n[1] First source.");
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.change(screen.getByLabelText("Source text for [1]"), {
      target: { value: "The first source says the first claim holds." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    const alert = (await screen.findByRole("alert")).textContent ?? "";
    expect(alert).toContain("OpenRouter rejected the key (HTTP 401)");
    expect(alert).toContain("Already contacted in this run: OpenRouter google/gemma-4-31b-it:free.");
    expect(alert).not.toContain("nothing was graded");
  });

  it("moves focus to each new step and announces the verified quote to screen readers", async () => {
    render(<App />);
    expect(document.getElementById("main")?.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /Claims and sources/ }));

    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    const heading = await screen.findByRole("heading", { name: /What the sources say/ });
    await vi.waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByText(/Checked \d+ of \d+/)).toBeNull();

    const first = Array.from(screen.getByRole("list", { name: "Results" }).children)[0];
    expect(first?.querySelector(".passage")?.textContent).toContain(
      "Verified quote: Students who slept at least seven hours",
    );
    expect(first?.querySelector(".passage")?.textContent).toContain("End of quote.");
  });

  it("names a cited reference that is not in the list beside the claim's result", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  grade: "supported",
                  evidence: "Mortality fell by 50% in the trial.",
                  reason: "Same figure.",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<App />);
    goLive("Mortality fell by 50% [1, 3].\nReferences\n[1] One.");
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.change(screen.getByLabelText("Source text for [1]"), {
      target: { value: "Mortality fell by 50% in the trial." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    const results = await screen.findByRole("list", { name: "Results" });
    const item = results.children[0];
    expect(item?.getAttribute("data-grade")).toBe("not_every_source_backs_it");
    expect(item?.textContent).toContain("Also cited but not in your reference list, so not checked: [3].");
  });

  it("cancels the model request in flight and makes no more after switching to the sample run", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.spyOn(window, "fetch").mockImplementation((_input, init) => {
      signals.push(init?.signal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    render(<App />);
    goLive("First claim holds here [1]. Second claim holds here [1].\nReferences\n[1] First source.");
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.change(screen.getByLabelText("Source text for [1]"), {
      target: { value: "The first source says the claims hold here." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    await vi.waitFor(() => expect(window.fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: "Sample run" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(signals[0]?.aborted).toBe(true);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });
});
