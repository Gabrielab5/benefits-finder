# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Israeli shoppers who carry several credit cards, clubs and store memberships (Max, Cal, Shufersal, Rebar, Histadrut, workplace programs…) and don't know which one to use. They use it on a phone, standing at the register or at an online checkout, and need the answer in seconds.

Anyone can sign up (email and password, Google, Facebook or an email code); it started as invite-only for the owner's friends and family. Design for a stranger who doesn't know the owner: first-run, trust and catalog breadth matter.

Admins are a second audience: they curate the shared catalog, review imports and invite users from the Sources tab.

## Product Purpose

Answers "which card should I pull out here?". Tell it once which cards and clubs you hold. Then type the store, and optionally the amount, and it tells you which card to pay with, what to show or enter, and how many ₪ you save.

Around that core: browse every benefit you can use, never miss special-date perks (birthday month, club birthday month, wedding anniversary, children's birthdays), and keep gift cards in one place (balance, expiry, which stores accept them).

Success: at the register, the right card is known within seconds, and no birthday perk or gift-card balance goes to waste.

## Positioning

The register answer, ranked by real shekels. Type a store in Hebrew or English, typos included, and the best card comes first. The ₪ saving is computed from minimum spend, caps and percent/fixed rules, including when a gift card is combined with the best discount. It works offline from an on-device snapshot, never connects to bank or card accounts, and costs ₪0 to run.

## Operating Context

- Phone-first installable PWA, used in stores, malls and basement supermarkets with no signal.
- One-time onboarding: which cards and clubs you hold, picked from a shared catalog, then your special dates.
- Five bottom tabs: Where am I (store search), All benefits, Wallet (plus gift cards), Import, Sources/settings.
- Catalog freshness: a monthly research refresh is loaded as pending imports, and a human approves each one before users see it.
- Private benefits: users add their own through a free-chatbot prompt round trip or by hand. They stay private.
- Reminders: push notifications for special dates, benefits expiring this week, gift cards expiring (30/7/1 days ahead) and new benefits; optional email reminders.

## Capabilities and Constraints

- Ranked by ₪: `percent_off` and `cashback_percent` (capped by `max_discount`), `fixed_off` (only above `min_spend`). Shown but not ranked, because no honest number exists: `points`, `bogo`, `gift`, `installments`, `other`.
- Results are grouped as Pay with / Show or enter code / Other. Card and membership benefits are not assumed to stack.
- Dates are evaluated in Asia/Jerusalem. A birthday benefit is valid for the whole birth month; benefits outside their window show as locked with their month.
- Never stored: full card numbers, CVV, bank or card-site credentials. At most an optional last 4 digits.
- Shared catalog plus private rows, enforced by Postgres row-level security. Only admins write to the shared catalog.
- Offline is read-only: search and ranking run from the snapshot; imports and wallet edits are disabled.
- Benefits are not guaranteed. Every benefit shows its conditions and links to its source.
- Not affiliated with any issuer, bank or club. Brand names and colors are used only to help people recognize their own cards.
- Today the UI is dark-only and Hebrew-only. A light theme, English and Arabic UI, and an accessibility pass are roadmap items, not shipped.
- Undecided: when and how public sign-up opens (a waiting list is one idea), and whether a native app wrapper happens.

## Brand Commitments

- Hebrew-first, RTL-native. Hebrew is the primary language and drives layout. English and Arabic UI may come later and must not drive it. Search already accepts English store names.
- Current name: "ההטבות שלי" (short name "הטבות"). In use, not declared binding.

## Evidence on Hand

- A real shared catalog of Israeli programs, stores and benefits in Supabase, seeded from `src/lib/seedPrograms.ts` and `src/lib/seedStores.ts`, each benefit with a source link.
- App screenshots in `docs/screenshots/` (store, wallet, benefits, home, import, login) and the README banner `docs/banner.svg`.
- Live app: https://benefits-finder-swart.vercel.app (open sign-up).
- None exist yet: testimonials, user counts, total savings figures, press or reviews. Do not fabricate them.

## Product Principles

1. **Answer at the register in seconds.** Store → card → ₪, one-handed, even offline.
2. **Honest numbers only.** Rank by ₪ only when it can be computed; label the rest; always show conditions and the source.
3. **Never touch the money.** No bank links, no card numbers, no credentials.
4. **Nothing unreviewed reaches users.** Shared catalog changes pass a human first.
5. **Built for strangers next.** Assume a new user who doesn't know the owner: explain, earn trust, assume no context.
