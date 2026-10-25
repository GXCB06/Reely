# Day 0 checklist (1–2 hours, no Claude Code)

Goal: have every account and key ready, and **prove the data we need actually comes back**
before building anything.

## 1. Accounts and keys

| # | Service | What to do | Key / value to save in `.env.local` |
|---|---|---|---|
| 1 | GitHub | Create an empty private repo `postlaunch` | — |
| 2 | Supabase | New project (region: Singapore). Auth → enable Email (magic link) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 3 | Vercel | Sign up with GitHub (Hobby plan) | — (connect the repo on Day 3) |
| 4 | Google Cloud | New project → enable **YouTube Data API v3** → create an API key, restrict it to that API | `YOUTUBE_API_KEY` |
| 5 | Google AI Studio | Create a Gemini API key; note the free limits shown for Flash | `GOOGLE_GENERATIVE_AI_API_KEY` |
| 6 | ScrapeCreators | Sign up (100 free credits). Claim bonus credits: say how you found them, star their GitHub repo, leave an **honest** G2 review | `SCRAPECREATORS_API_KEY` |
| 7 | Apify (backup) | Sign up for the free plan; don't build with it yet | `APIFY_TOKEN` (optional) |

Keep keys only in `.env.local` and your password manager. Never paste them into chat, issues or code.

## 2. Data tests (uses ~6 ScrapeCreators credits)

Open Git Bash and set your keys for this terminal only:

```bash
export SC_KEY="paste-scrapecreators-key-here"
export YT_KEY="paste-youtube-key-here"
```

Check ScrapeCreators' docs for exact endpoint names and parameters before running; the paths below
come from their homepage and may change.

**T1 — TikTok profile (need: followers)**
```bash
curl -s -H "x-api-key: $SC_KEY" "https://api.scrapecreators.com/v1/tiktok/profile?handle=flowaccountchannel" > t1.json
```

**T2 — TikTok profile videos (need: views, date, pinned flag per video)**
```bash
curl -s -H "x-api-key: $SC_KEY" "https://api.scrapecreators.com/v3/tiktok/profile/videos?handle=flowaccountchannel" > t2.json
```
Check: does the ~41.3K-view video (Sep 29, 2026, "why new businesses fail") appear? Are most
other videos around 300–900 views?

**T3 — TikTok keyword search (need: videos for a Thai keyword)**
Find the TikTok search endpoint in the ScrapeCreators docs, then search `โปรแกรมบัญชี`.
Save as `t3.json`. Check: Thai results? views and author followers included?

**T4 — TikTok transcript (nice to have)**
Use the transcript endpoint with one video URL from T2. Save as `t4.json`.

**T5 — YouTube Shorts search + stats (free)**
```bash
curl -s "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=10&q=AI%20accounting%20software&key=$YT_KEY" > t5.json
```
Then fetch `videos?part=statistics&id=...` for 2–3 IDs from `t5.json`. Check: view counts present.

Put the JSON files in `lib/adapters/__fixtures__/` — they become the fixtures Claude Code builds against.

## 3. Results

Run on 2026-10-25 (5 credits used, 5,097 left).

| Test | Pass? | Fields we got | Notes |
|---|---|---|---|
| T1 TikTok profile | ✅ | followers (22,800), likes, video count | 1 credit |
| T2 TikTok profile videos | ✅ | views, likes, comments, shares, saves, date, caption, URL | **10 videos per page** → 2 pages (2 credits) for a 20-video baseline. Pinned posts are included by default: use `include_pinned=false`. The 41.3K video was on page 2 |
| T3 TikTok keyword search | ✅ | 30 videos per call with views, date, caption, author handle **and author followers** | Thai results work. Older videos (2022–24) mixed in: use `date_posted=last-6-months`. `region` only sets the proxy country. AccOs Pro itself appeared (@accospro.app) |
| T4 TikTok transcript | ✅ | Full Thai transcript (WebVTT, with timestamps) | 1 credit |
| T5 YouTube search + stats | ✅ | 25 videos per search with views, likes, duration, date; channel subscribers via a second call | 102 quota units (search 100 + videos 1 + channels 1). Thai accounting videos on YouTube are mostly tiny channels (3–11 subscribers), so reach scores like 39× on 118 views are noise → **need a minimum-views filter**. `videoDuration=short` means under 4 min, not only Shorts |

Verified scores (FlowAccount, 20 recent videos): usual views ≈ 585 → the 41.3K video is **~70×**
(Breakout). From the T3 search: @expressbydk, 41,454 views with 487 followers → reach score **~85×**.

**If T3 fails** (no TikTok keyword search): research runs use YouTube only, and TikTok is used for
competitor tracking. Tell Claude Code before Day 1.
**If T2 has no view counts:** stop and rethink the TikTok source (try Apify) before building.

## 4. Design

Export 5–8 screenshots of the Lovable design (home, results grid, video detail, tracking) into
`docs/design/`.

## 5. First Claude Code prompt (Day 1)

> Read CLAUDE.md and SPEC.md. We're on Day 1. Plan only, don't code yet: set up the Next.js project,
> Supabase auth and the schema with RLS, next-intl (th/en), the adapter types, the YouTube and TikTok
> adapters using the fixtures in lib/adapters/__fixtures__/, and lib/scoring.ts. Show me the plan and the file
> list first.
