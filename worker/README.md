# MineCtris Leaderboard Worker

Cloudflare Worker backend for the Daily Challenge leaderboard.

## Routes

| Method | Path                      | Description                        |
|--------|---------------------------|------------------------------------|
| POST   | `/api/scores`             | Submit a daily challenge score     |
| GET    | `/api/leaderboard/:date`  | Fetch top 20 scores for a date     |

## Setup

### 1. Create KV namespace

```bash
npx wrangler kv:namespace create LEADERBOARD_KV
npx wrangler kv:namespace create LEADERBOARD_KV --preview
```

Copy the `id` and `preview_id` values into `wrangler.toml`.

### 2. Configure allowed origin

In `wrangler.toml`, set `ALLOWED_ORIGIN` to your production domain (e.g. `https://minectris.com`).
For local development, set it to `*`.

### 3. Install & run locally

```bash
npm install
npm run dev
```

### 4. Deploy

```bash
npm run deploy
```

## POST /api/scores — Request Body

```json
{
  "displayName": "Player123",
  "score": 4200,
  "linesCleared": 18,
  "date": "2024-03-16",
  "clientTimestamp": 1710547200000
}
```

**Rules:**
- `displayName`: 1–16 alphanumeric + underscore chars
- `date`: must equal today's UTC date (stale submissions rejected)
- `score / (linesCleared + 1)` must be ≤ 1500 (plausibility check)
- 1 submission per display name per day
- Up to 3 submissions per IP per day (different names)

**Success response:**
```json
{ "ok": true, "rank": 5, "total": 47 }
```

## GET /api/leaderboard/:date — Response

```json
{
  "date": "2024-03-16",
  "entries": [
    { "rank": 1, "displayName": "TopPlayer", "score": 9800, "linesCleared": 42 },
    ...
  ],
  "total": 47
}
```

Returns top 20 entries. Up to 100 are stored internally.

## KV Keys

| Key                          | Value                                | TTL    |
|------------------------------|--------------------------------------|--------|
| `leaderboard:YYYY-MM-DD`     | JSON array, top 100, sorted desc     | 7 days |
| `player:{name}:{date}`       | `{ submittedAt }` — rate limit       | 7 days |
| `ip:{hash}:{date}`           | `{ count }` — IP rate limit          | 7 days |
| `flagged:YYYY-MM-DD`         | Suspicious entries (not public)      | 30 days|
