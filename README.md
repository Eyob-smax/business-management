# Business Manager

An offline-first progressive web app for running a family restaurant: staff record
every sale from their phone, the numbers reach the database on their own, and the
owners see revenue, cost and profit by day, week, month and year — with phone
notifications when something happens.

Built with Next.js 15 (App Router), React 19, Tailwind v4, Drizzle ORM and Neon
Postgres.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL and the secrets (see below)
npm run db:push                # create the tables in Neon
npm run seed                   # accounts + a starter Ethiopian menu
npm run dev                    # http://localhost:3000
```

The first accounts come from `.env.local` (`SEED_ADMIN_NAME` / `SEED_ADMIN_CODE`
and friends) — set the names and codes you want *before* seeding. A blank name
skips that account; a blank code gets a random one, printed once. Everyone is
asked to choose their own code the first time they sign in.

Changed a code in `.env.local` after seeding? `npm run seed -- --reset-codes`
applies it to the existing account.

After that first run you never touch the env file again: **admins add and manage
staff inside the app**, under *Team & codes*.

To see the reporting screens with something in them:

```bash
npm run seed -- --demo         # ~6 weeks of sample sales and expenses
npm run seed -- --wipe-demo    # removes only the sample data
```

### Environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Neon connection string. **Server-side only** — never imported into a client component. |
| `SESSION_SECRET` | Signs the session cookie. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keys. `node -e "console.log(require('web-push').generateVAPIDKeys())"` |
| `VAPID_SUBJECT` | `mailto:` address for the push service. |
| `NEXT_PUBLIC_CURRENCY` | Display currency, default `ETB`. Also editable in Settings. |
| `NEXT_PUBLIC_BUSINESS_TZ` | Default timezone, `Africa/Addis_Ababa`. Also editable in Settings. |
| `SEED_ADMIN_NAME` / `SEED_ADMIN_CODE` | First admin. Read only by `npm run seed`. |
| `SEED_MANAGER_NAME` / `SEED_MANAGER_CODE` | Second admin. Blank name to skip. |
| `SEED_STAFF_NAME` / `SEED_STAFF_CODE` | First staff account. Blank name to skip. |
| `RESTAURANT_NAME` / `SHOP_NAME` | Starting business names, editable in Settings. |
| `CRON_SECRET` | Guards `/api/cron/daily-digest`. Unset = the endpoint is disabled. |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Powers both the summary and the bot. |
| `TELEGRAM_WEBHOOK_SECRET` | Guards the webhook. Unset = the bot is disabled. |
| `TELEGRAM_OWNER_CHAT_ID` | The owner. Always allowed. |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Anyone else allowed to use the bot. **This is the security boundary.** |
| `TELEGRAM_DIGEST_CHAT_IDS` | Who gets the nightly summary. Blank = everyone allowed. |
| `RESEND_API_KEY` / `DIGEST_EMAIL_FROM` | Optional email delivery. |

`src/db/index.ts` throws if it is ever loaded in a browser, and every module that
reads the database imports `server-only`, so a mistake fails the build instead of
shipping credentials to a phone.

---

## Offline: how a sale is kept safe

The promise is that a recorded sale is never lost, and everything below exists to
keep it.

```
staff taps Save
      │
      ├─▶ 1. IndexedDB ledger      (visible in "My sales" immediately)
      ├─▶ 2. IndexedDB outbox      ← the sale is safe from this point on
      │
      └─▶ 3. POST /api/sync        (retried; failure changes nothing)
                 │
                 ├─ applied    → removed from the outbox
                 ├─ duplicate  → removed from the outbox
                 ├─ retry      → stays queued, backs off, tries again
                 └─ rejected   → moved to quarantine, shown to a human
```

- **Nothing leaves the outbox without a per-operation verdict from the server.**
  A dropped connection, a 500, a closed app, a dead battery — the record is still
  there on the next launch.
- **Every write is idempotent.** Each operation carries a `clientId` generated on
  the device, and every target table has a `UNIQUE` index on it. Replaying a batch
  after a timeout cannot double-count a sale. There is a test for exactly this.
- **`rejected` never means deleted.** If the server permanently refuses something,
  it moves to a quarantine list in the sync panel where a person can retry it or
  knowingly discard it. Silent data loss is the one outcome the design refuses.
- **The device also syncs while the app is closed**, via Background Sync. The
  service worker reads the same outbox and posts it itself.
- **The till works with no network at all.** The menu is cached in IndexedDB and
  rendered from there; the network is only ever a refresh.
- **Totals are recomputed server-side.** The device supplies quantities and the
  price it displayed; it never gets to assert the arithmetic.

Sync triggers: coming online, app regaining focus, a new item being queued, a
20-second heartbeat while anything is pending, another tab syncing, and the
service worker waking in the background.

### Trying it offline

Offline behaviour needs a production build — the service worker is deliberately
not registered in `next dev`:

```bash
npm run build && npm start
```

Then, in Chrome DevTools → Application, confirm the worker is active, tick
**Network → Offline**, record a few sales, and untick it. The sync pill in the
header goes `offline → sending → all saved`, and the admin gets one notification
for the whole batch.

---

## Who can do what

Admins own the staff list. From *Team & codes* an admin can add somebody, edit
their name and role, reset a forgotten code, move them between access levels, or
delete the account outright.

Access has **three levels**, not an on/off switch, because "off" is too blunt
for a family business:

| Level | Can sign in | Can record | Use it when |
| --- | --- | --- | --- |
| **Full access** | yes | yes | Normal. |
| **Read only** | yes | no | Somebody is off sick or being paused — they keep being able to check what they sold, but cannot ring anything up. |
| **No access** | no | no | Somebody has left. Their past sales keep their name. |

Three properties make this trustworthy rather than decorative:

- **It bites immediately.** The session cookie lasts 120 days, so it is never
  the authority on permissions. Role and access level are re-read from the
  database on every page render and every write (deduped to one query per
  request), so blocking a phone at 2pm takes effect at 2pm.
- **A refused write never loses data.** The sync endpoint answers `403
  write-blocked`; the device keeps its queue untouched, tells the person
  recording is paused, and pushes the same records through the moment access is
  restored. There is a test that asserts exactly this round trip.
- **You cannot lock everyone out.** You cannot limit your own access, and the
  last admin with full access can be neither downgraded nor deleted.

Deleting is real deletion, and the UI says what it costs before asking: sales
are kept (`staff_id` is `ON DELETE SET NULL`) but the named orders lose their
name, and the confirm dialog states how many. **No access** is the better choice
almost every time, and the app says so.

## Telegram: the nightly summary and the bot

One Telegram bot does two jobs, and both are free — no card, no monthly cap,
and it works well on Ethiopian networks.

### 1. The nightly summary

Every night it sends the day's numbers: revenue, cost, profit, margin, orders,
best-selling dishes, busiest hour, who was working, and any problems staff
flagged that are still open.

Channels are Telegram (primary) and a phone notification to admins (free, no
setup). Email via Resend's free tier is optional if you want a searchable
written record.

> **SMS was removed on purpose.** No provider offers a free tier to Ethiopian
> numbers — every one is trial credit and then per-message billing, because
> Ethio Telecom charges for termination. Telegram does the same job for
> nothing, and answers questions on top.

### 2. The bot you can ask

Message the bot any time:

| | |
| --- | --- |
| `/today` `/yesterday` | takings, cost, profit, top sellers |
| `/week` `/month` `/year` | wider periods, each against the one before |
| `/dishes` | best sellers, most profitable, thinnest margins, by group |
| `/staff` | who sold what, busiest hour, best and quietest weekday |
| `/expenses` | running cost per day, where the money goes |
| `/notes` | messages and problems still open |
| `/menu` | what is on, what is sold out, what has not sold in 30 days |
| `/orders` | the last few orders today |
| `/find tibs` | one dish across today, week, month and year |
| `/summary` | the full nightly summary, on demand |

There are inline buttons too, so most of it is tapping rather than typing.

**The bot is read-only, by design and by test.** It can only ever query.
Recording a sale, editing a price, filing an expense and changing access all
stay in the app behind a real sign-in — a chat message is far too easy to spoof
or fat-finger to be allowed to change what the business believes it sold. The
smoke suite scans `src/lib/telegram/` for write calls (drizzle *and* raw SQL)
and fails if any appear, so this cannot rot.

### Setting it up (about 5 minutes)

```bash
# 1. Create the bot: message @BotFather in Telegram -> /newbot
#    Paste the token into TELEGRAM_BOT_TOKEN in .env.local
npm run telegram whoami          # check the token works

# 2. Everyone who should have access presses Start on the bot.
#    For a family group: add the bot to the group and send any message.
npm run telegram ids             # prints their chat IDs

# 3. Put the IDs in .env.local:
#      TELEGRAM_OWNER_CHAT_ID='123456789'
#      TELEGRAM_ALLOWED_CHAT_IDS='987654321,-100123456789'

# 4. Point Telegram at the deployed app
npm run telegram setup https://your-app.vercel.app
```

Then send `/today` to check. `npm run telegram info` inspects the webhook,
`npm run telegram off` removes it.

### Why the chat IDs live in the environment

The bot reads out revenue and profit, and a bot username is public — anyone can
find it and press Start. So the allowlist **is** the security boundary, and it
lives in environment variables rather than the database: it is deployment
configuration, and it must not be editable from a screen. With no allowlist
configured the bot answers *nobody*, rather than everybody.

The webhook is guarded twice: `TELEGRAM_WEBHOOK_SECRET` is registered with
Telegram and returned in a header on every update (anything without it is
refused before the body is parsed), and then the chat allowlist is checked per
update.

### Scheduling

`vercel.json` runs the digest once a day:

```json
{ "path": "/api/cron/daily-digest?daily=1", "schedule": "0 18 * * *" }
```

**18:00 UTC is 21:00 in Addis Ababa.** Vercel's Hobby plan allows only one cron
run per day, so the cron time *is* the send time and `?daily=1` tells the
endpoint to stop second-guessing it. To move the send, change the hour in that
expression (remember it is UTC: subtract 3 for Addis).

The `(day, channel)` unique index still applies, so an extra call - a retry, a
manual trigger - is a no-op rather than a second message.

**If your scheduler can run more often**, drop the `?daily=1` and use an hourly
schedule (`0 * * * *`) or an external runner. Then the endpoint checks the local
clock itself and the send hour lives in Settings instead of a cron expression,
which also means a missed run self-heals on the next hour.
[cron-job.org](https://cron-job.org) is free and allows any interval:

```
https://your-app.vercel.app/api/cron/daily-digest?key=<CRON_SECRET>
```

The endpoint requires `CRON_SECRET` (Bearer header or `?key=`). Without that
variable set it refuses everything rather than defaulting to open. An admin's
browser session is deliberately not sufficient either.

Query parameters: `?daily=1` lets the scheduler own the timing, `?force=1`
skips the hour check for a manual run, `?resend=1` skips the once-a-day guard,
`?date=YYYY-MM-DD` backfills a specific day.

## Money: how profit is worked out

Two independent sources of cost exist, because the owners asked for both.

| | |
| --- | --- |
| **Per-plate estimate** | Set on each dish in Menu. Drives per-dish profit and margin. |
| **Recorded expenses** | Rent, salary, gas, a market run. One-off, daily, weekly or monthly. |

A recurring expense is *prorated per day* — weekly ÷ 7, monthly ÷ days-in-month —
so the daily, weekly, monthly and yearly reports all reconcile to the same real
money. Open-ended recurring expenses stop accruing at today, so opening the year
view in January does not show twelve months of rent against one month of sales.

Any expense can be flagged **"this is what the food actually cost"**. On the days
it covers, that figure *replaces* the per-plate estimates. That is the override:
start from rough guesses per dish, then correct the record with real market spend
without editing thirty dishes.

`Settings → How should profit be worked out?` picks how they combine:

| Mode | Daily cost |
| --- | --- |
| **Estimates, corrected by real spending** (default) | override if one covers the day, otherwise estimates, plus running costs |
| **Per-plate estimates only** | estimates + all expenses as running costs |
| **Recorded spending only** | recorded expenses only |

Sale lines snapshot the name, price and cost **at the moment of sale**. Editing a
price next month never rewrites last month's reported profit.

Trading days respect a configurable cutoff hour, so a sale rung up at 01:30
belongs to the previous night's trade.

---

## What is in the app

**Staff** — a till with big tiles, search and category chips; cart with discount,
payment method, table label and a note for the office; "My sales" for the shift,
readable offline, each row saying whether the office has it yet. Staff never see
cost or profit.

**Admin** — dashboard with revenue / cost / profit / margin against the previous
period; reports with per-dish ranking by money-in, money-kept and plates-sold, a
cross-timeframe winners table, thinnest margins, busiest hours, best weekdays,
category and payment mix, per-person totals and dishes that sold nothing; a
per-dish page with a 30-day trend and its rank in every timeframe; the day log
with every order, when it was recorded versus when it synced, and cancel-with-a-
reason; expenses with the override switch; menu and price editor with live margin;
team and sign-in codes; settings.

**Both** — notes, messages, shift handovers and problems, threaded with replies,
attached to a trading day. Staff notes go through the offline outbox too.

**Notifications** — Web Push to admins with the app closed, one push per synced
batch, mirrored into an in-app bell so nothing is lost if the OS drops it.

**Export** — `Day log → CSV` gives summary, daily totals, every order and per-dish
performance for the selected period, UTF-8 with a BOM so Excel opens Amharic and
emoji correctly.

---

## Commands

| | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve — needed to test offline |
| `npm run db:push` | Apply the schema to Neon |
| `npx tsx --env-file=.env.local scripts/migrate-access.ts` | One-time: `users.is_active` → `users.access_level` |
| `npm run db:studio` | Browse the data |
| `npm run seed` | Accounts, categories and menu (safe to re-run) |
| `npm run seed -- --demo` | Add sample trading history |
| `npm run seed -- --reset-codes` | Apply the codes now in `.env.local` to existing accounts |
| `npm run reset-admin -- <name>` | New sign-in code for somebody who forgot theirs |
| `npm run reset-admin -- --list` | Who has an account |
| `npm run smoke` | Smoke test against a running server (69 checks) |
| `npm run telegram <cmd>` | Bot setup: `whoami`, `ids`, `setup <url>`, `info`, `off` |
| `npm run icons` | Regenerate the PWA icon set |
| `npm run lint` | ESLint |

The smoke test covers the security boundary (signed-out access, staff reaching
admin pages, staff filing expenses), all three access levels (a read-only device
is refused with `write-blocked` and keeps its queue; a blocked device is bounced
off every screen; the held records go through once access returns), the sync
contract (replay is a duplicate, a client-supplied total is ignored, a malformed
batch is refused), and that every page renders. It cleans up every row it
creates and always hands access back.

Run it against a **production** build (`npm run build && npm start`), not a dev
server started over the same `.next` directory — mixing the two corrupts the
build output and every page 500s in a way that looks like an app bug.

---

## Deploying

Any Node host works. On Vercel:

1. Push the repo, import it, and add the same environment variables.
2. `npm run db:push` once against the production database.
3. `npm run seed` once, and note the codes.
4. Open the site on each phone and use **Add to home screen** — Android will
   offer it; on iPhone it is Share → Add to Home Screen, and iOS only allows
   notifications for an installed app.

The app must be served over HTTPS (or localhost) for the service worker and push
to work. Session cookies are `httpOnly`, `sameSite=lax` and `secure` in
production, and last 120 days so nobody is logged out mid-shift.

---

## Notes on what is not built

The **mobile shop** is a stub, and `/shop` says so plainly rather than showing
empty charts. The groundwork is done — every table, the sync engine, auth,
notifications, notes and the whole reporting engine are already keyed by
`module` (`'restaurant' | 'shop'`) — so adding it is new screens plus stock
counting and per-piece buying prices, not a rewrite.

Admin-side writes (expenses, menu edits, team changes) go straight to the server
rather than through the outbox; they need a connection. The staff paths — sales
and notes — are the ones that must survive a dead spot, and they do.

## Layout

```
src/
  app/
    actions/        server actions: auth, menu, expenses, notes, sales, users, settings
    api/            sync, menu snapshot, push, notifications, CSV export
    admin/          dashboard, reports, day log, expenses, menu, dish, team, settings
    staff/          till, my sales
    notes/  login/  change-code/  offline/  shop/
  components/
    admin/ staff/ notes/ charts/ shell/ ui/ providers/ pwa/
  db/               Drizzle schema + Neon client (server-only)
  hooks/            menu cache, push subscription
  lib/
    analytics.ts    the profit engine and every report query
    sync-server.ts  the batch ingest and its four verdicts
    offline/        IndexedDB, outbox, sync engine (client)
    access.ts       the three access levels, as pure policy
    digest/         nightly summary: build.ts renders it, channels.ts delivers
                    it, send.ts claims (day, channel) so it goes out once
    telegram/       the read-only bot: api.ts talks to Telegram, access.ts is
                    the allowlist, bot.ts is every report and command
    auth.ts password.ts settings.ts expenses.ts notes.ts menu.ts money.ts dates.ts
public/
  sw.js             service worker: offline shell, push, background sync
  icons/            generated PWA icon set
scripts/
  seed.ts  reset-admin.ts  smoke-test.ts  make-icons.mjs
```

Money is stored everywhere as **integer minor units** (`*_cents`) — `120.50 Br`
is `12050`. Formatting happens only at the edge, in `lib/money.ts`.
