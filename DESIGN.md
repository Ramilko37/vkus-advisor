---
name: "VkusVill Advisor"
description: "A modern mobile-first grocery basket assistant that turns a natural-language request into three practical basket scenarios."
colors:
  background: "#f6f7f4"
  surface: "#ffffff"
  surfaceSoft: "#fbfcfa"
  ink: "#172019"
  textSecondary: "#58635a"
  textMuted: "#747c75"
  actionGreen: "#16a34a"
  actionGreenHover: "#11843c"
  actionGreenSoft: "#e9f7ec"
  warning: "#9a6700"
  warningSoft: "#fff8e8"
  error: "#b42318"
  errorSoft: "#fff1ef"
  thumbnail: "#edf0ea"
typography:
  fontFamily: '"Noto Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  displaySize: "clamp(40px, 11vw, 52px)"
  titleSize: "clamp(21px, 5.6vw, 28px)"
  bodySize: "16px"
  labelSize: "13px"
  weightNormal: 500
  weightStrong: 700
  weightKicker: 850
radii:
  small: "10px"
  control: "14px"
  card: "18px"
  large: "22px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  primaryButton:
    backgroundColor: "{colors.actionGreen}"
    color: "{colors.surface}"
    borderRadius: "{radii.control}"
    minHeight: "48px"
  glassSurface:
    background: "linear-gradient(177deg, rgba(255,255,255,.78), rgba(255,255,255,.48) 52%, rgba(255,255,255,.72))"
    borderRadius: "{radii.large}"
    borderColor: "rgba(255,255,255,.72)"
    shadow: "0 16px 36px rgba(23,32,25,.12)"
  basketCard:
    backgroundColor: "{colors.surface}"
    color: "{colors.ink}"
    borderRadius: "{radii.card}"
    shadow: "0 12px 30px rgba(23,32,25,.08)"
---

# VkusVill Advisor Design System

## 1. Overview

The creative north star is **a quiet grocery concierge**: modern, calm, helpful, and product-first. The app should feel like a focused service that helps a shopper assemble an optimal VkusVill basket under a real-life request, not like a generic ecommerce search page or a marketing landing page.

The flow is task-led: the user describes what they need, the system understands intent, checks catalog candidates, proposes three basket scenarios, then lets the user choose and refine one basket. The UI should make this progression obvious without exposing provider, model, MCP, or benchmark details.

The visual language is modern light utility with selective liquid glass. Glass is used where a surface needs focus and depth: composer, selected basket, checkout bar, loader, and important floating controls. Ordinary repeated content stays solid, scannable, and readable.

## 2. Colors

The base palette is fresh, quiet, and grocery-adjacent: milk-white surfaces on a warm green-gray background, deep green-black text, muted sage secondary text, and VkusVill green as the primary action signal.

Core tokens:

- `--background` / `--vv-bg`: `#f6f7f4` for the app canvas.
- `--surface` / `--vv-surface`: `#ffffff` for solid cards and controls.
- `--surface-soft` / `--vv-surface-soft`: `#fbfcfa` for nested wells and low-emphasis blocks.
- `--text-primary` / `--vv-text-primary`: `#172019` for primary copy and prices.
- `--text-secondary` / `--vv-text-secondary`: `#58635a` for explanatory copy.
- `--text-muted` / `--vv-text-tertiary`: `#747c75` for metadata.
- `--accent`: `#16a34a` for primary actions, active states, selected pills, and key status accents.
- `--accent-hover`: `#11843c` for hover and pressed action states.
- `--accent-soft`: `#e9f7ec` for subtle recommendation and tradeoff surfaces.
- `--warning` / `--warning-bg`: `#9a6700` / `#fff8e8` for slow, fallback, or partial states.
- `--error` / `--error-bg`: `#b42318` / `#fff1ef` for failed requests and blocking errors.

Use green sparingly. It should mean action, selection, recommendation, progress, or successful connection. Do not tint every card green. The UI loses hierarchy when the whole screen becomes one green theme.

AI gradients are allowed only as a restrained accent for loading, status dots, or animated liquid-glass highlights. They should not become the primary page background.

## 3. Typography

Use `"Noto Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif` across product surfaces. The interface is Russian-first, so Cyrillic rendering quality matters more than decorative personality.

Rules:

- Display titles use strong weight and compact line-height, but must never crowd mobile screens.
- Body copy uses `16px`, `500`, and `1.5` line-height for readability.
- Section kickers use uppercase, `13px`, `850`, and slight positive letter spacing.
- Prices are large and bold, but must not dominate the whole card. They are a decision aid, not a poster headline.
- Letter spacing is `0` for normal text and prices. Do not use negative tracking.
- Long Russian strings must wrap gracefully with preserved padding. Prefer readable wrapping over truncating important product names.

## 4. Layout

The product is mobile-first. The home route is a focused task entry screen, while the results route is a full-screen decision surface.

Layout rules:

- The app shell fills at least `100svh`.
- Home content stays narrow and immediately understandable.
- Results content should use the available viewport. Do not trap the card deck in a small decorative container.
- The card deck can let inactive cards peek from the sides, but active content must remain fully readable.
- Selected basket is the next step after choosing a variant, with clear return navigation at the same visual level as the profile control.
- Keep vertical rhythm tight on mobile. Every visible block should either help the user understand the task, choose a variant, or act on the basket.

Spacing scale:

- `4px` for hairline adjustments.
- `8px` for compact internal gaps.
- `12px` for related text groups.
- `16px` for control padding and row rhythm.
- `20px` to `24px` for card padding.
- `32px` for major section separation.

## 5. Elevation & Depth

Elevation is soft and ambient. The UI should feel modern and tactile, but never heavy.

Use three depth levels:

- **Solid cards**: white surface, subtle border, `0 12px 30px rgba(23,32,25,.08)`.
- **Liquid glass surfaces**: translucent white gradient, white border, inset highlight, `backdrop-filter: blur(18px) saturate(1.18)`, and soft shadow.
- **Floating action surfaces**: stronger green shadow only for primary actions and checkout.

Liquid glass is appropriate for:

- Chat composer.
- Fullscreen loader.
- Selected basket container.
- Sticky checkout bar.
- High-value floating controls.

Liquid glass is not appropriate for dense product rows, text-heavy variant content, or every repeated item. Those should remain solid for legibility.

## 6. Shapes

The system uses soft, practical radii:

- `10px` for small wells and metric blocks.
- `14px` for controls and buttons.
- `18px` for cards and basket rows.
- `22px` for large glass containers.
- `999px` for chips, pills, counters, and round icon buttons.

Cards should feel friendly but not toy-like. Avoid excessive roundness on dense product rows. Use pill shapes only for controls that behave like pills.

## 7. Components

### Chat Composer

The composer is the main input surface. It uses liquid glass, a clear prompt area, visible send action, and examples only when they reduce friction. The composer should fit inside the first screen on mobile with the header.

### Catalog Status

Status should be compact and reassuring. Show connection/search/model progress in plain language. Do not show internal provider details unless the user opens technical diagnostics.

### Basket Variant Card

Variant cards are decision cards. They should show:

- Variant title and optional recommendation badge.
- Short subtitle such as `Компромисс`, `Минимум стоимости`, or `Меньше готовки`.
- Price with controlled scale.
- A useful tradeoff summary, not duplicated metrics.
- Two soft metric wells.
- Three to four product preview rows.
- A soft tradeoff line.

Cards in the deck should look like physical cards in hand: active card centered, side cards peeking, swipeable, with smooth active-card motion. The active card must be opaque, padded, and fully readable.

### Basket Item Row

Basket rows are solid, scannable product rows. Use a real catalog image when available; fall back to an initial only when image data is absent. Product name, role, price, quantity, and remove action must remain readable on narrow screens.

### Selected Basket

The selected basket is the third step. It should use liquid glass because it is a focused working surface. It contains the chosen basket title, total, copy action, item rows, and checkout action.

### Checkout Bar

The checkout bar is a sticky liquid-glass action surface. It should display total and item count, then one strong green action button with a subtle animated highlight.

### Loader

The loader covers the full screen. It uses faded liquid glass with soft motion, not stripe-heavy decoration. It should communicate progress without making the wait feel broken.

## 8. Do's and Don'ts

Do:

- Make the first screen explain the product in one glance.
- Use real product images from catalog data whenever available.
- Keep Russian copy short, practical, and task-oriented.
- Let green signal action, success, selection, or recommendation.
- Use liquid glass for focus surfaces and transitional states.
- Keep cards opaque, padded, and readable.
- Preserve keyboard focus states and touch targets.

Don't:

- Do not expose OpenRouter, NeuralDeep, MCP, or schema details in the core UI.
- Do not make every surface transparent.
- Do not let decorative backgrounds crop or obscure content.
- Do not use a marketing hero when the user needs a working tool.
- Do not duplicate the same information in price, metrics, and summary.
- Do not truncate important Russian product names when wrapping would work.
- Do not use dark G2 defaults directly in the app surface.
