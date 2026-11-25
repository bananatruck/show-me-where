/*
 * Adapted from the Highlighter component of Magic UI
 * (https://github.com/magicuidesign/magicui, apps/www/registry/magicui/highlighter.tsx),
 * MIT License, Copyright (c) Magic UI.
 *
 * Changes: no in-view trigger and no motion dependency; the stroke is redrawn
 * when the enclosing block resizes and hidden from screen readers; it is drawn
 * without animation when the reader prefers reduced motion; when the browser
 * lacks ResizeObserver (or drawing fails) the text keeps a plain CSS
 * highlight instead, so the quote is always marked.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { annotate } from "rough-notation";

interface HighlighterProps {
  children: ReactNode;
  /** A CSS colour for the stroke; the caller passes the one for the current theme. */
  color: string;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Highlighter({ children, color }: HighlighterProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let observer: ResizeObserver | null = null;
    try {
      const annotation = annotate(element, {
        type: "highlight",
        color,
        multiline: true,
        iterations: 1,
        padding: 2,
        animate: !prefersReducedMotion(),
        animationDuration: 500,
      });
      const container = element.parentElement ?? element;
      // The stroke is decoration; the quote itself is marked up for screen readers.
      const hideStroke = () =>
        container.querySelectorAll("svg.rough-annotation").forEach((svg) => svg.setAttribute("aria-hidden", "true"));
      annotation.show();
      hideStroke();
      // The drawn stroke replaces the plain CSS highlight.
      element.classList.add("quote--drawn");
      // An inline element reports no resize when its lines reflow, so watch the
      // block that holds it and redraw when that block changes size.
      observer = new ResizeObserver(() => {
        annotation.hide();
        annotation.show();
        hideStroke();
      });
      observer.observe(container);
      return () => {
        observer?.disconnect();
        annotation.remove();
        element.classList.remove("quote--drawn");
      };
    } catch {
      element.classList.remove("quote--drawn");
      return undefined;
    }
  }, [color]);

  return (
    <mark ref={ref} className="quote">
      {children}
    </mark>
  );
}
