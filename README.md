<div align="center">

<img src="docs/banner.svg" alt="Benefits Finder — which card should I pull out at the register?" width="100%" />

<h3>ההטבות שלי · <i>Your Israeli credit-card & club benefits, in one place</i></h3>

<p>
  <a href="https://benefits-finder-swart.vercel.app"><img alt="Live app" src="https://img.shields.io/badge/live-benefits--finder-34d399?style=for-the-badge&logo=vercel&logoColor=white&labelColor=0b1020" /></a>
  <img alt="Invite only" src="https://img.shields.io/badge/access-invite%20only-f472b6?style=for-the-badge&labelColor=0b1020" />
  <img alt="Cost" src="https://img.shields.io/badge/running%20cost-%E2%82%AA0-94a3c4?style=for-the-badge&labelColor=0b1020" />
</p>

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" />
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e?logo=supabase&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/tests-Vitest%20%2B%20Playwright-6e9f18?logo=vitest&logoColor=white" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-works%20offline-5a0fc8?logo=pwa&logoColor=white" />
</p>

<b><a href="#-what-it-does">What it does</a> ·
<a href="#-screenshots">Screenshots</a> ·
<a href="#-how-the-best-card-is-chosen">How it works</a> ·
<a href="#-getting-started">Getting started</a> ·
<a href="#-roadmap">Roadmap</a> ·
<a href="#-faq">FAQ</a></b>

</div>

---

## 💡 The problem

Every Israeli wallet is full of plastic: a Max card, a Cal card, a supermarket credit card, Rebar and Delta+ clubs, the Histadrut card, a workplace benefits program… Each one hides dozens of discounts, cashback deals and birthday gifts on websites nobody reads.

So at the register you guess. You pay with whatever card is on top and walk away from money you were entitled to.

**Benefits Finder fixes that.** Tell it once which cards and clubs you have. From then on, type the store you're in, and it tells you **which card to pay with, what to show, and how many shekels you'll save**.

---

## ✨ What it does

<table>
<tr>
<td width="50%" valign="top">

### 🔍 "Where am I?"
Type a store in **Hebrew or English**, even with typos: `mango`, `Mango`, `מנגו`, `מקדונלדס` and `McDonald's` all work. Enter what you're spending and every benefit you hold is ranked by **real ₪ savings**. The winner gets a glowing **"הכי משתלם"** (best value) badge.

</td>
<td width="50%" valign="top">

### 💳 My wallet
Pick your cards and clubs from a shared catalog and they appear as **brand-style cards** (Max pink, Shufersal red, Rebar green…). Each card unlocks its benefits immediately. No typing and no setup per user.

</td>
</tr>
<tr>
<td valign="top">

### 📋 All benefits
Every benefit you can use, with **search plus filters**: only mine, card or club, issuer, category, benefit type, online vs. in-store, special dates and expiring this week. Each one shows the conditions, minimum spend, discount cap, coupon code and source link.

</td>
<td valign="top">

### 🎂 Special dates
Birthday month, your **club "birthday" month** (when a club uses a different one), **wedding anniversary** and **each child's birthday**. A banner appears when a window opens, benefits that are locked until their month say so, and an optional email reminder goes out.

</td>
</tr>
<tr>
<td valign="top">

### ➕ Free import, no AI bill
Got a card the catalog doesn't cover? The app writes a ready-made prompt. Paste it into **any free chatbot** (ChatGPT, Gemini, Claude) together with the benefits page, then paste the answer back. You review every row before it's saved. Manual entry works too.

</td>
<td valign="top">

### 👥 Shared catalog + private extras
Admins keep one **shared catalog** of programs, stores and benefits that everyone sees. Each user can add **private** benefits that only they see. Access is **invite-only**, managed from an in-app admin screen.

</td>
</tr>
<tr>
<td valign="top">

### 📶 Works offline
It's an installable **PWA**. Your last snapshot is stored on the device (IndexedDB plus a service worker), so the app still answers in a basement supermarket with no signal.

</td>
<td valign="top">

### 🔐 Easy, safe sign-in
**Google** sign-in or a **6-digit email code**. Postgres **row-level security** means users can never read each other's private data. Only admins can write to the shared catalog, and the database enforces that too.

</td>
</tr>
</table>

---

## 📸 Screenshots

<div align="center">
<table>
<tr>
<td align="center"><img src="docs/screenshots/store.png" width="230" alt="Store result ranked by savings" /><br/><sub><b>Which card here?</b><br/>₪ savings for ₪300 at Rebar</sub></td>
<td align="center"><img src="docs/screenshots/wallet.png" width="230" alt="Wallet with brand-style cards" /><br/><sub><b>My wallet</b><br/>brand-style card art</sub></td>
<td align="center"><img src="docs/screenshots/benefits.png" width="230" alt="All benefits with filters" /><br/><sub><b>All benefits</b><br/>search + filters</sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/home.png" width="230" alt="Home with birthday banner" /><br/><sub><b>Home</b><br/>birthday month banner 🎂</sub></td>
<td align="center"><img src="docs/screenshots/import.png" width="230" alt="Free chatbot import" /><br/><sub><b>Import</b><br/>free chatbot or manual</sub></td>
<td align="center"><img src="docs/screenshots/login.png" width="230" alt="Login" /><br/><sub><b>Sign in</b><br/>Google or email code</sub></td>
</tr>
</table>
</div>

---

## 🧮 How the best card is chosen

```mermaid
flowchart LR
    A["🔍 Store typed<br/>'mango' / 'מנגו'"] --> B["Fuzzy match<br/>Hebrew ↔ English,<br/>final letters, trigrams"]
    B --> C["Benefits for this store<br/>+ its category<br/>+ general benefits"]
    C --> D{"Do I hold a card<br/>or club that unlocks it?"}
    D -- no --> X["hidden"]
    D -- yes --> E{"Date window open?<br/>birthday · anniversary · kid"}
    E -- not yet --> L["🔒 shown as locked<br/>until its month"]
    E -- yes --> F["₪ saving for the amount<br/>min spend · cap · % / fixed"]
    F --> G["Grouped:<br/>💳 Pay with · 🪪 Show / code · ➕ Other"]
    G --> H["🏆 Best value highlighted"]
```

| Benefit type | How the ₪ saving is computed (for amount **A**) |
|---|---|
| `percent_off`, `cashback_percent` | `A × value%`, capped by `max_discount` |
| `fixed_off` | `value`, only if `A ≥ min_spend` |
| `points`, `bogo`, `gift`, `installments`, `other` | shown but not ranked by ₪, because no honest number exists |

Dates are always evaluated in **Asia/Jerusalem** time. A birthday benefit is valid **for the whole birth month**: born on 21.9 means the benefit runs from 1.9 to 30.9.

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Device["📱 Phone / browser (PWA)"]
        UI["Next.js 16 · React 19<br/>Hebrew RTL UI"]
        SW["Service worker<br/>+ IndexedDB snapshot"]
        Core["src/lib/core<br/>pure logic: search · rank ·<br/>savings · dates · merge"]
        UI --- Core
        UI --- SW
    end
    subgraph Vercel["▲ Vercel"]
        Proxy["proxy.ts<br/>auth gate"]
        API["/api/import · /api/admin/users"]
        Cron["⏰ Cron 06:00<br/>/api/cron/birthday"]
    end
    subgraph Supabase["🟢 Supabase"]
        Auth["Auth<br/>Google · email OTP"]
        DB[("Postgres + RLS<br/>shared rows: user_id = null")]
        Store["Storage<br/>imports bucket"]
    end
    UI --> Proxy --> API
    UI <--> Auth
    UI <--> DB
    API --> DB
    API --> Store
    Cron --> DB
    Cron -. optional .-> Resend["✉️ Resend email"]
```

**Design choices worth knowing**

- **All business logic is pure TypeScript** in [`src/lib/core`](src/lib/core) with no React and no database, so it's fully unit tested.
- **One table per concept, with sharing built in.** `programs`, `stores` and `benefits` rows with `user_id = null` are the shared catalog, and rows with a `user_id` are private. Row-level security does the rest.
- **Admin rights live in the database.** `is_admin()` is a security-definer function, and the `profile.is_admin` column is not grantable to users, so nobody can promote themselves.
- **No paid APIs needed.** The chatbot import works on the free tier of any chatbot. A paid Claude import path exists but is off unless `NEXT_PUBLIC_AI_API=on`.

### Data model

```mermaid
erDiagram
    PROFILE ||--o{ WALLET_ITEMS : owns
    CARD_PRODUCTS ||--o{ WALLET_ITEMS : "picked from"
    WALLET_ITEMS }o--o{ PROGRAMS : unlocks
    PROGRAMS ||--o{ BENEFITS : offers
    STORES ||--o{ BENEFITS : "valid at"
    PROGRAMS ||--o{ IMPORTS : "refreshed by"

    PROFILE {
        int birth_month
        int anniversary_month
        jsonb children
        bool is_admin
    }
    CARD_PRODUCTS {
        text name
        text type
        uuid_array program_ids
    }
    WALLET_ITEMS {
        text name
        uuid product_id
        int birthday_month
    }
    PROGRAMS {
        text name
        text kind
        text benefits_url
    }
    STORES {
        text name_he
        text name_en
        text_array aliases
        text category
    }
    BENEFITS {
        text title
        text type
        numeric value
        numeric min_spend
        text timing
        date valid_until
    }
    IMPORTS {
        text source
        jsonb extracted
        text status
        bool shared
    }
```

---

## 🚀 Getting started

### 1. Prerequisites
- Node.js **22+**
- A free [Supabase](https://supabase.com) project
- *(optional)* a free [Vercel](https://vercel.com) account for hosting, and a [Resend](https://resend.com) key for reminder emails

### 2. Install

```bash
git clone https://github.com/Gabrielab5/benefits-finder.git
cd benefits-finder
npm install
```

### 3. Database
In the Supabase SQL editor, run the migrations **in order**:

1. [`supabase/migrations/20261006000000_init.sql`](supabase/migrations/20261006000000_init.sql) creates the tables, RLS and storage bucket
2. [`supabase/migrations/20261007000000_shared_catalog.sql`](supabase/migrations/20261007000000_shared_catalog.sql) adds the shared catalog, special dates and admin role

Then in **Authentication → Providers**, enable Email and, optionally, Google.

### 4. Environment
Copy [`.env.example`](.env.example) to `.env.local` and fill it in:

| Variable | Required | What it is |
|---|:-:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Project URL, e.g. `https://xyz.supabase.co` (no `/rest/v1`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Publishable (anon) key |
| `SUPABASE_SECRET_KEY` | ✅ | Secret key: server only, never exposed to the browser |
| `CRON_SECRET` | ✅ | Any long random string; protects the cron endpoint |
| `APP_URL` | ✅ | Public URL of the app, used in emails |
| `RESEND_API_KEY` / `RESEND_FROM` | ➖ | Only for birthday and special-date reminder emails |
| `ANTHROPIC_API_KEY` / `NEXT_PUBLIC_AI_API` | ➖ | Only for the paid AI import (`on` to enable) |
| `GEMINI_API_KEY` | ➖ | AI chat on the home page (free key from Google AI Studio; `GEMINI_MODEL` optional) |
| `E2E_EMAIL` | ➖ | Test user for e2e tests. **Must contain `e2e`**, because the test wipes that user |

> [!CAUTION]
> Never commit `.env.local` or any `client_secret_*.json`. Both are git-ignored.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in, and the onboarding flow walks you through your dates and your cards.

### 6. Make yourself admin
Set `is_admin = true` on your row in the `profile` table once (SQL editor). The **Sources** tab then shows the admin panel for inviting users and the "shared" toggle on imports.

---

## 🧪 Testing

| Command | What it covers |
|---|---|
| `npm test` | ~150 unit tests: search, ranking, savings, dates, merge, import parsing, catalog rules |
| `npm run test:db` | Row-level security against a real Supabase: users can't see or edit each other's data, and only admins can write to the shared catalog |
| `npm run e2e` | Playwright: the full "search a store → best card first" flow and new-user onboarding |
| `npm run test:ai` | Regression tests for the optional paid AI extraction |
| `npm run lint` | ESLint |

---

## ☁️ Deployment

The app is hosted on **Vercel** and connected to this repo:

- push to `master` → **production** at https://benefits-finder-swart.vercel.app
- push to any other branch → a **preview** URL
- [`vercel.json`](vercel.json) schedules the daily reminder cron at **06:00 UTC**

Add the same environment variables in **Vercel → Settings → Environment Variables**, and add the production URL to **Supabase → Authentication → URL configuration** (Site URL and Redirect URLs).

### Keeping benefits fresh
Benefits change all the time. [`scripts/monthly-refresh.md`](scripts/monthly-refresh.md) describes the monthly refresh: re-research each program, load the results as **pending imports** with [`scripts/load-researched-benefits.mjs`](scripts/load-researched-benefits.mjs), review them in the app and approve. Nothing reaches users without a human review.

---

## 📁 Project structure

```text
src/
├─ app/
│  ├─ (tabs)/            # the 5 bottom-nav screens
│  │  ├─ page.tsx        # 🔍 Where am I?
│  │  ├─ benefits/       # 📋 All benefits
│  │  ├─ wallet/         # 💳 My wallet
│  │  ├─ import/         # ➕ Import + review
│  │  └─ sources/        # ⚙️ Sources, dates, admin
│  ├─ login/ onboarding/ auth/
│  └─ api/               # import · admin/users · cron/birthday
├─ components/           # BenefitCard, DatesForm, AdminPanel, ui
├─ lib/
│  ├─ core/              # 🧠 pure, tested business logic
│  ├─ ai/                # chatbot prompt + answer parser (+ optional paid AI)
│  ├─ email/             # reminder email builder
│  └─ snapshot.ts …      # data loading + offline cache
└─ proxy.ts              # auth gate (Next 16's middleware)
supabase/migrations/     # schema + RLS
scripts/                 # catalog loading, refresh, README screenshots
tests/                   # db (RLS) + e2e (Playwright)
```

---

## 🗺️ Roadmap

Ideas collected from real use and from "wouldn't it be cool if…". ✅ = done, 🔜 = next up, 💭 = exploring.

### 🛒 At the register
- 🔜 **Near me**: open the app inside a mall and the stores around you are suggested automatically (geolocation, on-device only)
- 🔜 **Home-screen shortcut and widget**: one tap from the lock screen to the store search
- 🔜 **Voice search**: say "שופרסל" and get the answer hands-free
- 💭 **Split-payment advice**: "pay ₪200 with Max to hit the minimum, the rest with Cal"
- 💭 **Online checkout helper**: a browser extension that detects the shop's site and shows the best card and coupon code
- 💭 **Scan a receipt** to see what you *could* have saved

### 💳 Wallet & benefits
- ✅ Brand-style card art, shared catalog, private benefits
- 🔜 **More cards in the catalog**: Isracard variants, Amex, Leumi Card, bank-branded and fuel-company cards, El Al and airline clubs, Hever, workers' committees, student and IDF/reservist benefits
- 🔜 **Points and miles value**: estimate the ₪ worth of points, so points benefits can be ranked too
- 🔜 **Expiry alerts**: "3 benefits you hold end this week"
- 🔜 **Favorites and "used it" history**, so you know which benefits you actually use
- 💭 **Annual fee vs. value report**: "this card cost you ₪240 a year and saved you ₪610"
- 💭 **"Which card should I get?"**: compare your spending with cards you *don't* have yet

### 🎂 Special dates
- ✅ Birthday, club birthday month, wedding anniversary, children's birthdays
- ✅ **Push notifications**: special dates, benefits expiring this week, new benefits for your cards (free, no Resend key needed)
- 🔜 **Holiday sales calendar**: Black Friday, Pesach and Rosh Hashana sales, back-to-school
- 💭 **Partner's birthday and pets** 🐶 (pet-store clubs have birthday perks too)

### 🔄 Keeping data fresh
- ✅ Monthly human-reviewed refresh
- 🔜 **"Report a wrong benefit"** button, so users can flag stale or broken deals for the admin
- 🔜 **Suggest a benefit**: users submit a deal they found; an admin approves it into the shared catalog
- 💭 **Automatic change detection** on issuers' benefit pages, so only changed pages need review
- 💭 **Community confirmations**: "worked for me ✅ / didn't work ❌" with a date

### 👪 Family & sharing
- 🔜 **Family wallet**: see your partner's cards too ("your spouse's Shufersal card gives more here")
- 💭 **Share a benefit** to WhatsApp in one tap

### 🌍 Reach & polish
- 🔜 **English and Arabic UI** (the search already understands English)
- 🔜 **Light theme** next to the current dark one
- 🔜 **Accessibility pass**: screen-reader labels, larger text mode, contrast
- 💭 **Native app wrapper** for the App Store and Google Play
- 💭 **Open sign-up** with a waiting list, once the catalog is broad enough

### 🛠️ Under the hood
- 🔜 Children keyed by id rather than name (two kids with the same name)
- 🔜 Admin: clearer error messages when an invite fails, and cleanup of a removed user's uploads
- 🔜 Automatic DB backups and a restore script
- 💭 Usage analytics that respect privacy (no third-party trackers)

> Have an idea? Open an [issue](https://github.com/Gabrielab5/benefits-finder/issues) and it may land here.

---

## ❓ FAQ

<details>
<summary><b>Does it connect to my bank or credit card account?</b></summary>
<br/>
No, never. The app only knows <i>which</i> cards and clubs you hold, because you picked them. It never asks for full card numbers, account logins or transactions. At most it keeps an optional last 4 digits, so you can tell two similar cards apart.
</details>

<details>
<summary><b>Where do the benefits come from?</b></summary>
<br/>
From each issuer's and club's public benefits pages. Research is loaded as pending imports and a human approves each one. Every benefit links to its source so you can check it.
</details>

<details>
<summary><b>Is a benefit guaranteed to work?</b></summary>
<br/>
No. Issuers change terms without notice. Treat the app as a smart reminder, and check the conditions (shown under <b>פרטים</b>, "details") or the source link before relying on a deal.
</details>

<details>
<summary><b>Why does it cost nothing to run?</b></summary>
<br/>
Supabase and Vercel free tiers cover a small invited group comfortably, and the import uses whatever free chatbot you already have instead of a paid AI API.
</details>

<details>
<summary><b>Can I add a card that isn't in the catalog?</b></summary>
<br/>
Yes. In <b>Wallet → Add → "משהו אחר (פרטי)"</b> ("something else, private"), create a custom item, then add its benefits in <b>Import</b>, using the free chatbot flow or by hand. They stay private to you.
</details>

<details>
<summary><b>How do I get access?</b></summary>
<br/>
The app is invite-only. Ask an admin to add your email in the admin panel, then sign in with Google or an email code.
</details>

---

<div align="center">

Made with 💚 in Israel · Hebrew-first, RTL-native · Built with Next.js, Supabase and Vercel

<sub>Not affiliated with any card issuer, bank or club. Brand names and colors are used only to help you recognize your own cards.</sub>

</div>
