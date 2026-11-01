// The "best" order of a research's results, shared by the search, the results page, Ask Reely, exports, the plan and
// the test set: best for the goal, then how well the clip's account fits the product, then the user's 👍/👎.
import { type Feedback, withFeedback } from "./feedback";
import { type Goal, scoreFor } from "./goals";
import { withCreatorFit } from "./results";
import type { ScoredVideo } from "./search";

export function bestOrder(goal: Goal | null | undefined, feedback: Feedback | null) {
  return withFeedback<ScoredVideo>(withCreatorFit<ScoredVideo>(scoreFor(goal), (v) => v.creatorFit), feedback);
}
