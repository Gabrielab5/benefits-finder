---
name: ההטבות שלי (Benefits Finder)
description: Which card to pull out at the register, in a dark pocket that glows where the savings are.
colors:
  mint: "#3ee8ad"
  mint-ink: "#04291b"
  sky: "#5cc8ff"
  violet: "#9b8cff"
  party: "#f77ac0"
  ink: "#161d38"
  panel: "#222b4d"
  panel-2: "#2c365c"
  line: "#3d4873"
  fg: "#f4f6fc"
  muted: "#b0b8d4"
  dim: "#96a2c6"
  warn: "#fcc93a"
  bad: "#ff7a93"
typography:
  display:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
  title:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  body-strong:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.025em"
  caption:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  3xl: "24px"
  full: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "3.5": "14px"
  "4": "16px"
  "5": "20px"
components:
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    rounded: "{rounded.xl}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    rounded: "{rounded.xl}"
    padding: "10px 16px"
  button-secondary-hover:
    textColor: "{colors.mint}"
  button-ghost:
    textColor: "{colors.mint}"
    rounded: "{rounded.xl}"
    padding: "10px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.panel-2}"
  button-danger:
    textColor: "{colors.bad}"
    rounded: "{rounded.xl}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  chip-active:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  input:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
  nav-bar:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.2xl}"
    padding: "6px"
  nav-item:
    textColor: "{colors.dim}"
    typography: "{typography.caption}"
    rounded: "{rounded.xl}"
    padding: "6px 0"
  nav-item-active:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.mint}"
    rounded: "{rounded.xl}"
  notice:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
  benefit-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.2xl}"
    padding: "14px"
  wallet-card:
    textColor: "{colors.fg}"
    rounded: "{rounded.2xl}"
    padding: "12px"
---

# Design System: ההטבות שלי (Benefits Finder)

## Overview

**Creative North Star: "The Pocket Concierge"**

A premium, attentive companion in your pocket. The world is a dark, lined wallet interior: deep navy layers, a soft aurora drifting behind them, and glass-edged panels that sit quietly until something is worth your attention. When an answer arrives (the best card, the shekels saved, the one action to take), it is lit in glossy Savings Mint. The concierge is calm by default and confident when it speaks.

Density is phone-first and compact: one centered column, readable at arm's length in a noisy store, built for one thumb. Hebrew leads and the layout is right-to-left at its core, not mirrored after the fact. The concierge also has manners and a little warmth: birthday banners in Celebration Pink and a catch-the-shekels coin game while you wait. A small luxury on a free app.

Color comes from the cards themselves. Issuer card art (Max pink, Shufersal red, Rebar green) supplies the vivid color. The chrome around it stays navy so your own cards are the brightest thing in the wallet.

**Key Characteristics:**
- Dark only: deep navy tonal layers over a fixed violet and mint aurora.
- Calm panels, glossy answer: flat bordered surfaces, with gloss and glow saved for the primary action, the active chip and savings.
- Issuer card art is the color source. UI chrome never borrows brand colors.
- One type family (Heebo) for Hebrew and Latin, with mono only for codes and card digits.
- Soft, nested rounding from the 24px login shell down to full pills.
- Every tap answers instantly: a press-down scale, a spinner, a fade-up entrance. Reduced motion is respected globally.

## Colors

A deep navy night with one money-green voice, a violet haze for atmosphere and a pink reserved for celebrations.

### Primary
- **Savings Mint** (#3ee8ad): money saved, the best card, the primary action, active chips, the active tab and links. Mint fills always render as a glossy gradient fading into Horizon Sky, with a top highlight and a soft mint glow. Quiet markers (step numbers, onboarding progress, your own chat messages) use a flat mint tint instead, with no gloss.
- **Deep Mint Ink** (#04291b): text and icons sitting on a mint fill. Never used on navy.
- **Horizon Sky** (#5cc8ff): the far end of every mint gradient. Not used as a standalone fill.

### Secondary
- **Aurora Violet** (#9b8cff): atmosphere. The top-start aurora glow, the page-header icon tile gradient, and the hover border on inactive chips.

### Tertiary
- **Celebration Pink** (#f77ac0): special dates and gifts. The birthday-month banner, "available in your month" pills on locked benefits, and the gift-cards entry.

### Neutral
- **Midnight Pocket** (#161d38): the page itself, under the aurora. Also the deepest stop of the waiting screen's game area.
- **Lining Navy** (#222b4d): the default surface. Cards, benefit cards, the floating nav bar, the login shell.
- **Raised Lining** (#2c365c): one step up. Inputs, secondary buttons, the active tab pill, info notices, and value badges inside cards.
- **Stitch Line** (#3d4873): every 1px border and divider.
- **Receipt White** (#f4f6fc): primary text and headings.
- **Fog** (#b0b8d4): secondary text, subtitles, inactive chip labels.
- **Dusk** (#96a2c6): tertiary text. Section titles, placeholders, captions, inactive tab labels. It holds at least 4.5:1 on Midnight Pocket, Lining Navy and Raised Lining (6.5, 5.4 and 4.6:1), and stays a clear step below Fog.

### Status
- **Nudge Amber** (#fcc93a): "spend ₪X more to save ₪Y" nudges and warning notices. Used as text over a 10% tint.
- **Alert Coral** (#ff7a93): errors and destructive actions. Used as text over a 10% tint, or as text on a danger button.

### Named Rules
**The Mint Means Money Rule.** Savings Mint marks savings, the winning result and the single primary action in view. If it isn't about saving money or moving forward, it isn't mint.

**The Cards Bring the Color Rule.** Issuer brand colors live only on card art and card swatches, where they help people recognize their own cards. Buttons, banners, chips and headings never use them. The one exception is the login collage: real issuer card art, club logos and photos, shown purely as illustration and nowhere else in the app.

**The Tinted Status Rule.** Warn, error, success and celebration states use the hue as text, a 10% tint as fill and a 30% tint as border. Never a solid saturated fill.

## Typography

**Display Font:** Heebo (with system-ui, sans-serif)
**Body Font:** Heebo (with system-ui, sans-serif)
**Label/Mono Font:** the system monospace stack, only for coupon codes and card last-4 digits

**Character:** One humanist sans that carries Hebrew and Latin with equal ease. Clear at small sizes, friendly at bold weights. Hierarchy comes from weight and size, never from a second family.

### Hierarchy
- **Display** (700, 1.875rem, 1.2): the app name on the login screen. Nowhere else.
- **Headline** (700, 1.5rem, 1.33): screen titles such as "איפה אני?" and "ברוכים הבאים".
- **Title** (700, 1.25rem, 1.4): page headers next to their icon tile.
- **Body Strong** (600, 1rem, 1.375): benefit titles and card names. The thing you scan for.
- **Body** (400, 0.875rem, 1.43): the workhorse. Descriptions, button text, chips, notices, form text.
- **Label** (600, 0.75rem, 0.025em tracking): section titles in Dusk, the "best value" badge, pills and meta rows.
- **Caption** (400, 0.6875rem): tab labels, "saving" under a ₪ figure, small hints.

### Named Rules
**The One Family Rule.** Heebo everywhere. Monospace appears only for strings a person types or reads out at the register (coupon codes, card digits), set left-to-right inside the RTL flow.

**The Shekel Figure Rule.** A computed saving is the loudest number on its card: 1.125rem, 700, in Savings Mint, aligned to the end edge, with a caption beneath.

## Layout

A single centered column, at most 576px wide (36rem), with a 16px side gutter. The top padding respects the safe-area inset, with an 8px minimum. Each tab screen leaves 112px at the bottom so content clears the floating navigation.

Rhythm is built on a 4px base: 8px between items in a list, 12–16px between groups, 20px inside the login shell. Wallet cards sit in a two-column grid. Lists such as benefits, gift cards and sources stack vertically with 8px gaps. Filter chips scroll horizontally in a single row and never wrap into a block. The row shows no scrollbar track; both edges fade over the 16px gutter, so a chip cut at the edge reads as more to scroll.

The layout is right-to-left at its core: Hebrew text, start and end alignment, logical insets (`end`, `inline-end`), and tab order flowing right to left. Swiping right moves to the next tab. Left-to-right islands (codes, card digits, English store names) are marked `dir="ltr"` or `dir="auto"` locally.

### Named Rules
**The Start Side Rule.** Use logical properties (start/end, inline-start/inline-end) for every inset, alignment and icon position. Physical left and right are a bug in an RTL-first app.

**The Thumb Reach Rule.** Navigation floats at the bottom inside the safe area, and the main input sits near the top of its screen. On a phone, nothing important lives only in the top corners.

## Elevation & Depth

Depth is a hybrid. Tonal layering does most of the work (Midnight Pocket → Lining Navy → Raised Lining), with a 1px Stitch Line border and a faint white inner highlight on the top edge of every panel, like light catching glass. Real drop shadows are rare and purposeful. Glossy mint fills cast a mint glow. Wallet cards lift off the page like physical plastic. The floating nav uses a 95% opaque surface with a backdrop blur. The whole page sits on a fixed aurora: a violet radial glow at 18% from the top-start corner and a mint radial glow at 12% from the bottom-end corner.

### Shadow Vocabulary
- **Glass edge** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05)`): every panel surface. Not optional.
- **Mint gloss** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45), 0 4px 18px -6px rgb(62 232 173 / 0.6)`): every mint fill (primary button, active chip).
- **Answer glow** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05), 0 4px 18px -6px rgb(62 232 173 / 0.6)`): the hoisted answer on the store screen only, with its mint border (`.answer`).
- **Card lift** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3)`): wallet card art only.
- **Collage depth** (`filter: drop-shadow(0 4px 8px rgb(0 0 0 / 0.35))` back, `drop-shadow(0 10px 12px rgb(0 0 0 / 0.4))` middle, `drop-shadow(0 18px 24px rgb(0 0 0 / 0.55))` front): the login collage's pieces only. A drop shadow follows each cut-out's shape; the middle step is Card lift in that form.

### Named Rules
**The Gloss Is Earned Rule.** Panels stay flat at rest. Gloss, glow and the shine sweep appear only on the primary action, an active chip, or a savings mark. If everything shines, nothing does.

## Shapes

Soft and pocket-friendly, with radii that nest smaller as you go inward. The login shell uses 24px. Cards, the nav bar and wallet cards use 16px. Buttons, inputs, notices, nav items and icon tiles use 12px. Value badges use 8px. Mini card swatches use 6px. Chips and status pills are full pills. Wallet card art follows credit-card proportions (1.6:1). Icon tiles are square (40px for page headers, 28px for on-card actions).

### Named Rules
**The Nested Radius Rule.** An inner element never has a larger radius than its container. Step down 24 → 16 → 12 → 8 → full pills only for free-standing tags.

## Components

### Buttons
Confident and instantly responsive: every press dips to 98% scale, and a loading button disables itself and shows a spinner on the same frame.
- **Shape:** gently rounded (12px), 10px × 16px padding, 0.875rem text.
- **Primary:** glossy Savings Mint gradient fill with Mint Gloss, Deep Mint Ink text at 600. On hover it brightens 10% and a white shine sweeps across in 0.7s (also on keyboard focus).
- **Secondary:** Raised Lining fill, 1px Stitch Line border, Receipt White text. On hover the border turns 60% mint and the text turns mint.
- **Ghost:** mint text with no fill. On hover it gains a Raised Lining fill.
- **Danger:** Alert Coral text with no fill. On hover it gains a Raised Lining fill.
- **Disabled:** 40% opacity with no pointer events. While loading it stays at 80% so the spinner reads.

### Chips
- **Style:** full pill, 6px × 14px, 0.875rem. Inactive chips have a 60% Lining Navy fill, a Stitch Line border and Fog text.
- **State:** inactive chips get a violet border and white text on hover. Active chips get the full glossy mint fill with Deep Mint Ink text at 600 and the shine sweep. Chips are toggle buttons (`aria-pressed`), except one-tap picks (recent stores, chat suggestions), which are plain buttons.
- **Status pills** (inside cards): 12px text with a 10% tint fill in party, warn or panel-2, or a hairline border for "private" and coupon codes.
- **Hit area:** chips and tappable pills keep their size but reach 44px with an invisible `.tap` hit area (see Focus & Targets).

### Cards / Containers
- **Corner Style:** 16px. The login shell uses 24px.
- **Background:** Lining Navy, with Raised Lining for nested blocks.
- **Shadow Strategy:** glass edge only (see Elevation & Depth).
- **Border:** 1px Stitch Line. A tinted border (party/30, mint/40) marks an entry point with a specific job, such as the gift-cards link or a mint outline action.
- **Internal Padding:** 16px by default, 14px in dense lists, 20px in the login shell.

### Inputs / Fields
- **Style:** Raised Lining fill, 1px Stitch Line border, 12px radius, 10px × 12px padding, Receipt White text, Dusk placeholder. Native pickers are forced to a dark color scheme.
- **Focus:** the border turns Savings Mint and gains a 1px mint ring. No outline glow beyond that.
- **Disabled:** 50% opacity.

### Focus & Targets
- **Focus ring:** every link, button, chip, tab, `<summary>` and custom control shows a 2px Savings Mint outline with a 2px offset on `:focus-visible`, following its radius. Text fields are the exception: they keep their mint border and ring, so they never get a double ring.
- **Tap targets:** every control has at least a 44×44px hit area. Small controls (chips, pills, the "פרטים" toggle, icon buttons) keep their visual size and grow the hit area with the `.tap` pseudo-element instead.
- **Focus follows the task:** a form that opens below the fold scrolls into view and focuses its first field. Picking a store moves focus to the amount, and clearing it returns focus to the search.
- **Destructive actions** live inside the edit form, behind a confirm, never next to the edit button on a card face.

### Navigation
A floating bottom bar: inset 12px from the screen edges and above the safe area, 576px max, Lining Navy at 95% with backdrop blur, a 16px radius, a Stitch Line border and 6px inner padding. Four equal tabs (איפה אני, הטבות, ארנק, עוד), each a stacked 20px Lucide icon over an 11px label. Inactive tabs are Dusk (hover Fog) at a 1.8 stroke. The active tab sits on a Raised Lining pill, turns mint, and uses a 600 label and a 2.4 stroke. Tabs carry `aria-current="page"`. "עוד" opens a plain list of the screens that don't need a tab (adding benefits, the catalog, settings), each with one plain-language line, and stays active on all of them. Horizontal swipes move between tabs, unless the gesture starts inside an input or a horizontal scroller.

### Home (store search)
The working screen, not a landing page: a greeting and the "איפה אני?" title, the special-date banner when a window is open, then the store search. With no store picked, the search is followed by the user's own things: up to five recent-store chips under "חנויות אחרונות" (stored per device, most recent first), the expiring gift-card banner, and a folded "שאלו את העוזר" row that opens the AI chat inline. A first-time user with neither sees one Dusk hint line under the search instead.

### Page Header
A 40px square icon tile with a 12px radius, a violet-to-mint diagonal tint at 30%/20%, a mint icon and a hairline white ring, set before a Title-size heading and a Fog subtitle.

### Notices
A 12px-radius line of body text in four tones: info (Raised Lining, Fog), warn, error and success. The last three follow the Tinted Status Rule.

### Benefit Card (signature)
The answer unit on the store screen and the all-benefits list. A Lining Navy card (16px, 14px padding) with a 44×28px mini card swatch in issuer colors at the start. Next comes the benefit title in Body Strong with the action line beneath ("pay with" / "show" plus the card and program names). The ₪ saving (Shekel Figure Rule) or a value badge sits at the end. The best result is hoisted directly under the amount field as the answer: a mint "הכי משתלם" label with a sparkle icon and why it won, the action first in bold ("הציגו רי-בר", "שלמו עם מקס") with the benefit title beneath, the ₪ figure and its derivation, and the coupon code to copy. It gets a full mint border and the Answer glow. The rest follow under "עוד אפשרויות", without the winner. Long value badges wrap inside a 40% end column so the title keeps most of the row. Under 360px a value badge moves to its own row under the title; a ₪ figure keeps the end column. Date-locked benefits keep full-contrast text: the swatch goes grey, the title drops to Fog and a pink "available in" pill says when it opens. Details expand in a native `<details>` with a rotating chevron, and the source link is in mint.

### Wallet Card (signature)
Each held card or club is drawn as a credit-card shaped tile (1.6:1, 16px radius, Card Lift shadow). The fill is a 140° gradient between two approximate issuer colors. Without a known brand, the user's chosen color fades into the page ink. A black scrim deepens from clear to 40% toward the light end, so white text holds 4.5:1 on every issuer. The top-start corner carries an 11px black-weight wordmark with 0.08em tracking. The card name is in bold with a drop shadow; the program names and the last 4 digits (tracked mono) share the bottom row, so a two-line name never pushes them out. The one on-card action is a 28px edit tile in 25% black with backdrop blur and a 44px hit area; delete lives in the edit form.

### Waiting Screen
Long waits (sign-in, reading a gift card, importing) show a spinning coin with a warn-to-mint gradient and a tap-to-catch shekel coin game, instead of a bare spinner.

### Login Collage
The login screen's first impression, and the only place the app shows real issuer art. A decorative panel (`aria-hidden`, empty alts) of card cut-outs, club-logo stickers and stock photos, plus ₪ coins in the Waiting Screen's warn-to-mint gradient and three money badges (percent, banknote, gift) on Lining Navy glass tiles.
- **Layout:** from md up, the collage fills the start half at full height and stays put while the form is centered in the other half. On a phone it is the top 40svh, and the form is a sheet pulled 24px up over it (Midnight Pocket, 24px top radius, Stitch Line top edge), so the email field and the primary button sit above the fold even at 320×568.
- **Composition:** one square composition, scaled to cover the panel and cropped like a photo, so a wide phone header and a tall desktop half show the same arrangement (the phone zooms 1.25× into its middle). A fan of three cards is the focal point just off center, the photos are large prints at the edges, and most logos are dimmed into the back. Three depth layers: back (72% brightness), middle and front, each with a deeper Collage depth shadow. Rotations stay within ±14°, and pieces bleed off the edges. Every piece is one row of a data array in `LoginCollage.tsx`; pieces hidden on a phone are never downloaded there.
- **Grade:** a 20% navy wash pulls the art into the app's world, the violet aurora sits in the top-start corner, and the panel fades into the page ink toward the form (the end side on a desktop, the bottom on a phone), so there is no seam.
- **Caption:** two lines of Body Strong in Fog on the darkened bottom edge, desktop only. On a phone the tagline right below says the same.
- **Motion:** each piece settles onto the table once (0.9s on `cubic-bezier(0.16, 1, 0.3, 1)`, back layer first, staggered by about half a second). Nothing loops, and nothing moves under reduced motion.
- **Credit:** under the form, after the trust lines: "הלוגואים והכרטיסים שייכים לבעליהם ומוצגים להמחשה בלבד."

## Do's and Don'ts

### Do:
- **Do** reserve the glossy mint gradient for the primary action, active chips and savings marks (The Mint Means Money Rule).
- **Do** build depth with tone (#161d38 → #222b4d → #2c365c), a 1px #3d4873 border and the 5% white top highlight, before reaching for a shadow.
- **Do** draw issuer cards as two-stop gradients with a wordmark, at 1.6:1. Brand colors stay on card art and swatches.
- **Do** use logical start/end properties everywhere, and mark LTR islands (codes, digits, English names) locally.
- **Do** give every tap immediate feedback: 0.98 press scale, a spinner on loading buttons, and the coin-game waiting screen for long operations.
- **Do** give every control a 44px hit area and the 2px mint `:focus-visible` ring (see Focus & Targets), and keep text at 11px or larger.
- **Do** enter new content with `fade-up` (0.6s) or `pop-in` (0.35s) on `cubic-bezier(0.2, 0.8, 0.2, 1)`, and keep the global reduced-motion override intact.
- **Do** use Celebration Pink for special dates and gift cards, Nudge Amber for "spend more" nudges and Alert Coral for errors, all as tinted pills or notices.

### Don't:
- **Don't** use issuer brand colors (Max pink, Shufersal red, Rebar green…) on buttons, banners, chips or headings. The app is not affiliated with any issuer.
- **Don't** put drop shadows on panels or cards. Only mint fills, the hoisted answer, wallet card art, the login collage's pieces and the floating nav get real depth.
- **Don't** use mint for decoration, headings or non-savings emphasis.
- **Don't** introduce a second typeface. Monospace is only for codes and card digits.
- **Don't** use physical left/right for layout or icon placement.
- **Don't** ship a light surface or light-only component. The app is dark-only until a light theme is designed as a whole.
- **Don't** use solid saturated fills for status. Use the hue as text over a 10% tint.
- **Don't** put landing-page furniture on a working screen: no hero badges, gradient or shimmering text, numbered how-it-works steps or looping decorative animation.
