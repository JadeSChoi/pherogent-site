/**
 * The proof-sheet's reading of one Section: its text interleaved with the
 * review pass's sentences at their offsets, so the page renders the exact
 * section text with each prepared sentence as its own span. Pure layout
 * support — no review semantics live here.
 */

import type { ReviewSentence } from "../storage/workspace";

export type ProofSegment =
  | { kind: "text"; text: string }
  | { kind: "sentence"; sentence: ReviewSentence };

/** Sentences must be in document order with offsets into `text`, as a
 * non-stale pass guarantees. */
export function proofSegments(
  text: string,
  sentences: ReviewSentence[],
): ProofSegment[] {
  const segments: ProofSegment[] = [];
  let at = 0;
  for (const sentence of sentences) {
    if (sentence.start > at) {
      segments.push({ kind: "text", text: text.slice(at, sentence.start) });
    }
    segments.push({ kind: "sentence", sentence });
    at = sentence.end;
  }
  if (at < text.length || !segments.length) {
    segments.push({ kind: "text", text: text.slice(at) });
  }
  return segments;
}
