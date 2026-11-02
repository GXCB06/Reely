// The "best" order of a research's results, shared by the search, the results page, Ask Reely, exports, the plan and
// the test set: exact matches before broader clips, then best for the goal, then how well the clip's account fits the
// product, then the user's 👍/👎.
import { type Feedback, withFeedback } from "./feedback";
import { type Goal, scoreFor } from "./goals";
import { withCreatorFit, withExactFirst } from "./results";
import type { ScoredVideo } from "./search";

export function bestOrder(goal: Goal | null | undefined, feedback: Feedback | null) {
  return withExactFirst(labelOrder(goal, feedback));
}

/** The order before exact matches came first (S1): kept for the test set's before/after. */
export function labelOrder(goal: Goal | null | undefined, feedback: Feedback | null) {
  return withFeedback<ScoredVideo>(withCreatorFit<ScoredVideo>(scoreFor(goal), (v) => v.creatorFit), feedback);
}
