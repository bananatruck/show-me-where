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
});

describe("App", () => {
  it("labels the sample run as synthetic", () => {
    render(<App />);
    expect(screen.getByRole("note").textContent).toContain(SAMPLE_RUN.label);
  });

  it("runs the sample end to end with no key", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));

    const claims = screen.getByRole("list", { name: "Cited claims" });
    expect(within(claims).getAllByRole("listitem")).toHaveLength(5);
    const uncited = screen.getByRole("list", { name: "Not checked: no citation" });
    expect(uncited.textContent).toContain("Many students say they sleep less during exam weeks.");

    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    const results = await screen.findByRole("list", { name: "Results" });
    const items = Array.from(results.children);
    expect(items.map((li) => li.getAttribute("data-grade"))).toEqual([
      "supported",
      "partly_supported",
      "cannot_tell",
      "supported",
      "cannot_tell",
    ]);
    expect(items[1]?.textContent).toContain(
      "In the intervention group, memory scores rose by 8% after two weeks of extra sleep.",
    );
    expect(items[2]?.textContent).toContain(REASONS.quoteNotFound);
    expect(items[2]?.querySelector("s")?.textContent).toContain("Supported, quoting");
    expect(screen.getByText(/Model: Recorded replies \(synthetic\)/)).toBeTruthy();
  });

  it("refuses a model id that is not free in live mode", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: /Live/ }));
    fireEvent.change(screen.getByLabelText("Text to check"), {
      target: { value: "A holds [1].\nReferences\n[1] X." },
    });
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "k" } });
    fireEvent.change(screen.getByLabelText("Model id"), { target: { value: "vendor/paid-model" } });
    fireEvent.click(screen.getByRole("button", { name: "Find claims" }));
    fireEvent.click(screen.getByRole("button", { name: "Check claims" }));
    expect((await screen.findByRole("alert")).textContent).toContain(":free");
  });

  it("keeps the key in session storage unless asked to remember it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: /Live/ }));
    fireEvent.change(screen.getByLabelText("OpenRouter key"), { target: { value: "abc" } });
    expect(window.sessionStorage.getItem("claim-check.openrouter-key")).toBe("abc");
    expect(window.localStorage.getItem("claim-check.openrouter-key")).toBeNull();

    fireEvent.click(screen.getByLabelText("Remember on this device"));
    expect(window.localStorage.getItem("claim-check.openrouter-key")).toBe("abc");
  });
});
