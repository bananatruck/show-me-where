// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { REASONS } from "./core/grading";
import { SAMPLE_RUN } from "./fixtures/sample";

afterEach(() => {
  cleanup();
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

  it("keeps the key in session storage unless asked to remember it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "Live with your key" }));
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "abc" } });
    expect(window.sessionStorage.getItem("claim-check.openrouter-key")).toBe("abc");
    expect(window.localStorage.getItem("claim-check.openrouter-key")).toBeNull();

    fireEvent.click(screen.getByLabelText("Remember on this device"));
    expect(window.localStorage.getItem("claim-check.openrouter-key")).toBe("abc");
  });

  it("switches to the dark theme and remembers it", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("show-me-where.theme")).toBe("dark");
  });
});
