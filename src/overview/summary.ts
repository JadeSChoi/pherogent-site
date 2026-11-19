/**
 * The Overview's project summary (issue #23): the active Project's counts,
 * its review progress across all Sections, and the one next action its
 * state calls for. Pure reads over the Project — nothing here writes.
 */

import {
  defaultManuscript,
  manuscriptWordCount,
  type Project,
} from "../storage/workspace";
import { reviewProgress, type ReviewProgress } from "../review/review";

/** Where a next action leads; the Overview's two forward destinations. */
export type SummaryDestination = "library" | "manuscript";

/** The one primary next action the project's state calls for. */
export type NextAction = {
  label: string;
  destination: SummaryDestination;
  /** Why this is the next step, in one sentence. */
  reason: string;
};

export type ProjectSummary = {
  sourceCount: number;
  sectionCount: number;
  wordCount: number;
  review: ReviewProgress;
  nextAction: NextAction;
};

export function projectSummary(project: Project): ProjectSummary {
  const sourceCount = (project.sources ?? []).length;
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const wordCount = manuscriptWordCount(project);
  const review = reviewProgress(project);
  return {
    sourceCount,
    sectionCount: manuscript.sections.length,
    wordCount,
    review,
    nextAction: nextAction(sourceCount, wordCount, review),
  };
}

function nextAction(
  sourceCount: number,
  wordCount: number,
  review: ReviewProgress,
): NextAction {
  if (sourceCount === 0) {
    return {
      label: "Save your first source",
      destination: "library",
      reason: "A project starts in the Library: find papers and save the ones worth reading.",
    };
  }
  if (wordCount === 0) {
    return {
      label: "Start the manuscript",
      destination: "manuscript",
      reason: "Sources are saved; the Manuscript is waiting for its first sentences.",
    };
  }
  if (review.total === 0) {
    return {
      label: "Keep writing the manuscript",
      destination: "manuscript",
      reason: "Nothing written so far is long enough to review as a sentence.",
    };
  }
  if (review.awaitingDecision > 0) {
    return {
      label: "Decide the prepared sentences",
      destination: "manuscript",
      reason: "A review pass is open with prepared sentences still waiting on your decision.",
    };
  }
  if (review.decided === 0) {
    return {
      label: "Prepare sentences for review",
      destination: "manuscript",
      reason: "The Manuscript has sentences no review pass has opened yet.",
    };
  }
  if (review.decided < review.total) {
    return {
      label: "Prepare more sentences for review",
      destination: "manuscript",
      reason: "Decisions cover part of the Manuscript; preparing again opens the next sentences.",
    };
  }
  return {
    label: "Export the manuscript",
    destination: "manuscript",
    reason: "Every reviewable sentence carries a decision.",
  };
}
