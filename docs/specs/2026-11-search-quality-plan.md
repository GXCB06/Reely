# Search quality plan (v0.2, before 1.7) — draft for review, 2026-11-01

Nothing here is built. Each step lists its cost and how it gets measured.

## 1. Where we are

Latest re-run batch (6 briefs, Instagram fallback version) against the v0.2 targets:

| | TikTok P@10 | YouTube P@10 | IG P@10 | Creators@5 | IG useful | Credits / useful clip | Seconds |
|---|---|---|---|---|---|---|---|
| Now | 60% | 76% | 44% | 38% | 5.5 | 1.7 | 48 |
| Target | 80% | 80% | 70% | 80% | 15 | falls | first result ≤ 15 s (1.7) |

P@10 counts only clips the judge marks **2** (about the product's own problem, category or job). 1 = same field or
audience, but not the product's own problem or category.

## 2. What the data says (judged clips, keyword yields and run stats from the latest batch)

1. **Almost every miss is a "1", not a "0".** Off-topic junk is rare (a few: @grok, @hevyapp's office video). The misses
   are clips one step away from the product's category:
   - accountant lifestyle and humour (accounting app);
   - general AI tips (Aetox);
   - content-creator gear that isn't a microphone (GoChek, 6 of 10 TikTok clips);
   - headphone amps and video-editing tips (GoChek IG).
   The relevance filter lets these through on purpose: `relevanceKeep` keeps score-1 clips whenever a run has
   fewer than 15 score-2 clips, and most runs do.
2. **The order ignores relevance.** "Best" ranks by label tier (Breakout / Strong), then views × engagement, with only a
   small nudge for account fit (×0.92). A "1" Breakout outranks a "2" Strong.
   - Aetox IG: four exact matches sat at ranks 10–13, below five "1"s.
   - Re-ordering Instagram by the judge's own labels would lift IG P@10 from 44% to ~57%, so ordering matters. Still,
     the IG ceiling is low because there are only 9–17 Reels in total.
3. **The view minimum discards most of what we pay for.** Per platform, 55–75% of the clips found are dropped as
   "below the minimum views" before relevance is even checked. Examples:
   - Fitbod YouTube: 5 of 122 kept (76 dropped for views);
   - Aetox TikTok: 13 of 125 kept (minimum 100K);
   - SaaS AI Instagram: 0 of 55 kept.
   On-topic clips under the minimum are thrown away unseen, together with the accounts that made them.
4. **We already download feeds we don't use.**
   - For TikTok and YouTube, the top 5 creators' feeds are fetched (paid on TikTok) to get their usual views.
   - Their standout clips are only added when the account is a *similar product* (`similar.has(key)` in lib/search.ts).
   - An on-topic creator's other 3–5× hits are dropped, though they cost nothing more.
5. **Keywords decide most of the outcome, and yields are very uneven.** Re-runs reuse the original keywords, so none of
   our tuning has touched them yet.
   - High yield: competitor or brand phrases ("Fitbod app" 23 TikTok clips, "Duolingo app" 20 across platforms) and exact
     category phrases ("รีวิวไมโครโฟนไร้สาย", "AI บัญชี").
   - Low yield or "1"s: broad phrases ("อุปกรณ์ทำคอนเทนต์", "แอปช่วยทำงาน", "ลดขั้นตอนการทำงาน", "สอนแต่งเสียงวิดีโอ").
   - Wasted slots: the product's own name ("AccOS Pro", 1 clip, its own account is filtered out). "accounting app"
     found 0 kept TikTok clips.
   - Ambiguous Thai: "แอปทำบัญชี" brought 50 off-topic TikTok clips (บัญชี = bank / social account).
6. **Creators@5 is just "whose clips top the list".** It is the first 5 distinct accounts in clip order. It moves with
   the clip order, not on its own. The creator judge also marks big general accounts (@davidgoggins_s, @coachbrodiecasa)
   as "1" even when one clip promoted a fitness app.
7. **Measurement is noisy and partly self-graded.**
   - With 6 briefs, untouched platforms swing ±5–8 points between batches (TikTok 65→60% with no TikTok change).
   - The filter (`rateRelevance`) and the judge (`judgeRelevance`) are both Gemini. The prompts differ, but nobody has
     checked how often the judge agrees with you.
   - Each live batch costs 115–140 credits, so we can't try many variants.

## 3. Principles

- **Fix measurement first:** cheap, trustworthy measurement makes every later step faster.
- **Free levers before paid ones:** order, filters, and feeds we already download.
- Show on-topic results first, and label broader ones honestly instead of hiding or mixing them.
- Change one thing per measured step. Add ~10 distinct hold-out briefs so we don't tune to 11. (Correction: the 24
  non-core entries in the test set are re-runs of the same 6 briefs, not a hold-out.)

## 4. Steps, in order

### S0 — Replay and judge check (0 credits, migration 0018) — built 2026-11-01, waiting for the migration and the first replay

Built as planned:
- `/app/eval/replay` with 4 order variants (today, exact first, exact first within a tier, exact only);
- `/app/eval/check` (60 clips, blind);
- Core and Hold-out rows on /app/eval;
- `run_results.relevance` and `run_candidates`.

Migration 0018 is applied and the code is live. The first replay ran on all 35 briefs (relevance scores filled from a
fresh check, newly surfaced clips judged; AI only). It is saved as the snapshot "replay baseline (S0)".

| Order (11 core briefs) | TikTok P@10 | YouTube P@10 | IG P@10 | Creators@5 | Concentration | Clips per brief |
|---|---|---|---|---|---|---|
| Today | 59% | 55% | 43% | 39% | 27% | 32 |
| Exact matches first | 65% | 55% | 48% | 43% | 27% | 32 |
| Exact first within a tier | 60% | 55% | 43% | 39% | 27% | 32 |
| Exact matches only | 82% | 76% | 68% | 54% | 40% | 23 |

Latest re-run batch (6 briefs), same orders:

| Order | TikTok P@10 | YouTube P@10 | IG P@10 | Creators@5 | Concentration | Clips per brief |
|---|---|---|---|---|---|---|
| Today | 60% | 76% | 44% | 38% | 33% | 39 |
| Exact matches first | 73% | 78% | 51% | 48% | 34% | 39 |
| Exact first within a tier | 60% | 76% | 44% | 39% | 33% | 39 |
| Exact matches only | 89% | 89% | 76% | 50% | 45% | 30 |

What this tells us:
- **"Exact first within a tier" does nothing.** Label tiers dominate the top 10.
- **"Exact matches first" helps** (TikTok +6–13, IG +5–7, creators +4–10) and keeps every clip.
- **"Exact matches only" reaches or nears the targets,** but costs ~25% of the clips and pushes concentration to
  40–45%, past the 40% target.
- **All of it depends on the search's relevance score matching a human.** The judge and the score are both Gemini, so
  these gains are only trusted after the blind check.
- **IG "useful" for "exact only" (6.2 vs 5.5) is an artifact:** briefs left with no Instagram clips drop out of that
  average.

Still to do:
- **Blind check:** 60 clips, the owner's time.
- **Hold-out briefs:** the owner's other researches are all the same 5 products, so there are no distinct hold-out
  candidates there yet.
- **Candidate pool:** `run_candidates` fills from the next owner research.

#### Blind check and judge v4 (2026-11-02)

The owner labelled 60 clips blind (20 per platform). Today's judge (v3) against the owner:

| | Same label | Says 2 → you agree | Your 2s it finds | Kappa |
|---|---|---|---|---|
| Judge v3, all 60 | 52% | 73% | 67% | 0.22 |
| Search's relevance score, all 60 | 57% | 68% | 76% | 0.25 |

Judge v4 added:
- the goal's own definition of 2;
- "the problem shown on screen" and gear for the same job;
- the brief as context.

It was tuned on a dev half (31 clips, 2 rounds) and measured once on a test half (29 clips):

| | Dev: says 2 → agree | Dev: 2s found | Test: says 2 → agree | Test: 2s found | Test kappa |
|---|---|---|---|---|---|
| Judge v3 (today) | 88% | 75% | 54% | 54% | 0.01 |
| Judge v4 (round 2) | 80–84% | 80% | 54% | 54% | 0.11 |

Round 1 was worse even on the dev half (71% / 75%). It read the brief's style wishes ("no hard sell") as relevance,
and general advice as "the pain".

**Verdict: v4 is not adopted; v3 stays the judge.**
- **On the 2s that P@10 counts, v4 is no better on the test half.**
- **The two halves disagree wildly** (v3: 88% vs 54%). With 30 clips per half, these numbers swing too much to tune a
  prompt on. The gap is not mainly wording.
- **Two likely causes remain, and neither is tested yet:**
  - the judge reads only captions, while the owner could watch the clip;
  - the owner's own labels have a ceiling: nobody agrees with themselves 100% on borderline clips.

**Until then:**
- P@10 numbers from the AI judge are rough. Treat differences under ~10 points as noise.
- S1 stays on hold.

- **Store the candidate pool.** Store every candidate a research saw, kept or dropped, in a new table `run_candidates`.
  Each row holds:
  - the clip, its platform and keyword;
  - its drop reason;
  - its relevance score, creator fit and copy score.
  Owner researches and test-set re-runs only, about 150–300 rows per run.
- **Add "Replay" to /app/eval.**
  - It re-applies a filter and order variant to the stored pools (keep rule, view floor, relevance-first order, fit
    factors) and judges only the newly surfaced clips (AI only).
  - It reports P@10 and creators@5 next to the live numbers.
  - Filter and order changes then cost **0 credits** to evaluate, on every brief in the set (core, hold-out, re-runs), with no run-to-run noise.
- **Judge check (your time, about 20 minutes).** You label 60 clips: 10 per platform from 2 Thai and 2 English briefs.
  - The eval page shows how often the AI judge agrees with you.
  - If agreement on "2" is under ~80%, fix the judge prompt before trusting any further gains.

### S1 — Exact matches first (0 credits; needs S0's stored relevance)

- Store each clip's relevance score on `run_results` (same migration).
- In `bestOrder`, use relevance as the first tier: 2 above 1, then label tier, then views × engagement, then creator fit.
- On the results page, score-1 clips get their own band, "Same audience, broader topic" (กลุ่มคนดูเดียวกัน หัวข้อกว้างกว่า),
  under the exact matches. They stay available but stop competing with them.
- **Measured with Replay first.** Expected: TikTok and IG P@10 rise wherever a run has 10+ exact matches. Creators@5
  should rise too, because the top clips come from on-topic accounts.

### S2 — Use the feeds we already have (0 credits, one more AI call)

- **TikTok and YouTube.** Take standout clips (2×+ usual, the user's view minimum and window) from **every fit-2 account**
  among the top 5 looked up, not only similar products. Up to 3 per account, then a relevance check that keeps 2s only.
- **Instagram** (last proposal):
  - feed picks must score 2;
  - accounts that prove on topic (2+ exact matches) get 2 more pages and up to 6 picks, within the 25-credit cap;
  - stats record yield per seed source.
- **Measured with a live batch** (feeds change, so Replay can't). That's the 11 core briefs, about 220 credits, together
  with S1.

### S3 — On-topic clips under the view minimum (0 credits; your decision on the UX)

- Run the relevance check on dropped clips that reach **≥ 30% of the minimum** (e.g. 3K–10K at a 10K minimum). This
  costs AI tokens, no credits.
- Use them in two ways:
  - **As account seeds:** an on-topic account with a 5K clip can still have 50K hits. Lookups go to fit-2 accounts
    first, whatever their views.
  - **As fill:** when a platform has fewer than 10 exact matches, show up to 5 of them in their own band, "Under your
    view minimum", with their numbers.
- The view minimum stays the user's filter. Nothing under it mixes into the main list.
- **Measured with Replay** (the pools hold the dropped clips) plus the S2 batch.

### S4 — Better keywords (+2–3 credits per research; changes cost rule 2)

- **Planner rules** (in `understandProduct`), checked against the keyword yields above:
  - at least 2 competitor or brand phrases for startup and sell goals;
  - never the product's own name for startup;
  - every phrase must name the category (no "gear", "work" or "content" on their own);
  - ambiguous Thai words come with the category word (บัญชี → โปรแกรมบัญชี / ทำบัญชี).
- **Adaptive second pass**, after the relevance check:
  - the keyword with the most exact matches gets page 2 on TikTok (1 credit, `cursor`);
  - a keyword under 20% on-topic is replaced once with a phrase built from the hashtags of this run's score-2 clips
    (1 search, 1 credit).
- **Test-set re-runs need a "re-plan" option** (new keywords from the same brief). Plain re-runs reuse the old keywords,
  so they can't measure this.
- **Measured with** a live batch on the 11 core briefs (about 250 credits), with re-plan on.

### S5 — Thin topics, said plainly (0 credits)

- When a platform has fewer than 3 exact matches (e.g. Thai accounting on Instagram), the results say so. They offer
  one tap for Worldwide or a 180-day window instead of padding the list with "1"s.

## 5. Budget and order

| Step | Credits | Measured by | Ships if |
|---|---|---|---|
| S0 Replay + judge check | 0 | your 60 labels | judge agrees ≥ 80% on "2" |
| S1 Exact matches first | 0 | Replay, core + hold-out | P@10 up, creators@5 not down |
| S2 Use our feeds (+ IG) | ~220 (11 re-runs) | live batch | useful clips up, P@10 not down, ≤ 60 s |
| S3 Under-the-minimum | 0 | Replay + S2 batch | exact matches per run up |
| S4 Keywords | ~250 (11 re-plans) | live batch | P@10 and useful clips up, cost per useful not up |
| S5 Thin topics | 0 | by hand | — |

Total about 470 credits, against about 1,000 in five ad-hoc batches so far. Each step is one session, with a snapshot
before and after (rule 21). We stop tuning and move to 1.7 when two steps in a row move nothing beyond noise.

**Realistic outcome:**
- TikTok and YouTube P@10 in the high 70s to 80s from S1 + S4.
- IG P@10 near 70% from S1 + S2, while IG useful stays below 15 for Thai niche topics. Thai Instagram supply is thin,
  and S5 is the honest answer there.
- Creators@5 should follow the clip order, but 80% likely also needs Phase 2's separate "accounts to follow" list,
  ordered by fit.

## 6. Risks

- **Self-grading:** the same model family filters and judges. That's why S0's agreement check comes first.
- **Over-fitting to 11 briefs:** every step reports the hold-out briefs next to the core ones.
- **S1 changes what users see first** (more exact matches, fewer big-view broad hits). The "Same audience" band keeps
  the broad hits one scroll away.
- **S4 raises cost per research by 2–3 credits.** Cost rule 2 changes only with your OK.

## 7. Not in this plan

New paid providers, more than 5 keywords, transcripts in search (rule 6), and streaming (1.7, next).
