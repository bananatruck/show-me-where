/*
 * Adapted from the Highlighter component of Magic UI
 * (https://github.com/magicuidesign/magicui, apps/www/registry/magicui/highlighter.tsx),
 * MIT License, Copyright (c) Magic UI.
 *
 * Changes: no in-view trigger and no motion dependency; the stroke is drawn
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
      annotation.show();
      // The drawn stroke replaces the plain CSS highlight.
      element.classList.add("quote--drawn");
      observer = new ResizeObserver(() => {
        annotation.hide();
        annotation.show();
      });
      observer.observe(element);
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
