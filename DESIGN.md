---
name: "VkusVill Advisor"
description: "A mobile-first grocery delivery assistant that turns a natural-language request into three practical basket scenarios."
colors:
  background: "#eef2ea"
  surface: "#ffffff"
  surfaceSoft: "#f6f8f3"
  ink: "#101511"
  textSecondary: "#4f5b52"
  textMuted: "#748075"
  groceryGreen: "#09911f"
  groceryGreenHover: "#057519"
  groceryGreenSoft: "#e7f8e7"
  deepGreen: "#0d3424"
  dealLime: "#85d90f"
  mint: "#dff8ef"
  checkoutBlack: "#101511"
  warning: "#9a6700"
  warningSoft: "#fff8e8"
  error: "#b42318"
  errorSoft: "#fff1ef"
typography:
  fontFamily: '"Noto Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  screenTitle: "34px"
  cardTitle: "22px"
  bodySize: "16px"
  labelSize: "13px"
  weightNormal: 500
  weightStrong: 720
  weightAction: 780
radii:
  small: "10px"
  control: "16px"
  card: "16px"
  large: "24px"
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
    backgroundColor: "{colors.groceryGreen}"
    color: "{colors.surface}"
    borderRadius: "{radii.control}"
    minHeight: "48px"
  checkoutButton:
    backgroundColor: "{colors.checkoutBlack}"
    color: "{colors.surface}"
    borderRadius: "{radii.pill}"
    minHeight: "48px"
  categoryTile:
    backgroundColor: "{colors.surface}"
    iconBackground: "{colors.mint}"
    borderRadius: "{radii.card}"
  pricePill:
    backgroundColor: "{colors.groceryGreen}"
    color: "{colors.surface}"
    borderRadius: "{radii.pill}"
  promoCard:
    background: "linear-gradient(135deg, #09911f, #35b54a 55%, #92da20)"
    color: "{colors.surface}"
    borderRadius: "{radii.large}"
---

# VkusVill Advisor Design System

## 1. Overview

The creative north star is **Grab Food meets Groceria**: a compact grocery delivery app with an AI basket planner inside it. The app should feel like a practical mobile commerce surface, not a chat demo and not a marketing landing page.

The product flow stays task-led: delivery context, describe what to buy, quick grocery categories, compare three basket scenarios, open checkout, adjust items, then create or copy the basket.

## 2. Visual Language

Use a fresh white shell over a pale green-gray canvas. The top offer area is the strongest brand moment: saturated grocery green, rounded corners, short copy, and a food cue. Ordinary cards stay white and readable. Deep black is reserved for checkout and final action emphasis.

Green means grocery brand, availability, selected state, price, or progress. Lime is only for deals and positive promo badges. Avoid making every surface green.

## 3. Typography

Use one Russian-friendly sans stack. Product UI uses fixed sizes, not fluid display type:

- Main screen title: `34px`, strong, balanced wrapping.
- Card title: `22px`, compact line-height.
- Body: `16px`, medium weight, readable contrast.
- Labels: `13px`, no uppercase tracking by default.
- Prices use tabular numbers and compact pill treatment.

## 4. Layout

The app is mobile-first. On phones it fills the viewport; on wider screens the home route may read as a centered mobile app surface.

Core layout rhythm:

- Top utility bar: search, delivery location, profile.
- Promo card: one strong grocery offer / planner promise.
- Composer: primary task entry, directly usable.
- Category shortcuts: four compact tiles.
- Offer examples: horizontal promo cards.
- Results: three grocery scenario cards.
- Selected basket: checkout sheet with solid item rows.
- Bottom nav: home route only; checkout has its own fixed CTA.

## 5. Components

### Delivery Topbar

Topbar is utility, not decoration. Location is centered; the profile control stays the real account/address action.

### Promo Card

The promo card carries the brand energy. Use saturated green, white text, and one food cue. Keep the copy short and actionable.

### Chat Composer

The composer behaves like a grocery search/request field with prompt chips. It stays white, stable, and keyboard-friendly.

### Category Tiles

Tiles are compact rounded buttons with a soft mint icon well. They help the screen feel like grocery delivery even before results exist.

### Basket Scenario Card

Scenario cards use white surfaces, price pills, metric chips, a short preview list, and a black open action. They should scan like product cards, not reports.

### Basket Item Row

Rows are solid pale surfaces with real product thumbnails when available. Quantity, replace, delete, and price must wrap cleanly on narrow screens.

### Checkout Bar

Checkout is a floating pill. Total and item count sit left; final action is black, matching delivery-app checkout conventions.

## 6. Accessibility

Maintain 44px minimum touch targets, visible focus rings, readable Russian text, and no horizontal overflow on small screens. Animations must respect reduced motion.
