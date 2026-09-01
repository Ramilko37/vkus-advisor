# Focused AI Utility Redesign

## Status

Approved product direction, prepared for implementation.

## Context

The current application has grown from a focused AI basket planner into a partial grocery marketplace shell. It now includes marketplace-style search, category tiles, bottom navigation, favourites, a promo hero and retailer tabs, while the product's differentiated value remains the task-led flow:

`describe a grocery task -> provide delivery context -> receive real retailer baskets -> compare strategies -> edit -> continue to purchase`

The redesign returns the product to a focused AI utility while preserving multi-retailer aggregation, profile defaults, real catalog data and basket editing.

## Product Positioning

The product is a neutral basket aggregator, not a VkusVill-branded service.

Working product name: **Умная корзина**.

The name must be centralized in one brand constant/config so it can be replaced later without searching through the UI. VkusVill, Lenta and Pyaterochka are equal connected retailers. The interface must not imply official affiliation with any retailer.

Core promise:

> Опишите задачу обычным языком. Мы найдём реальные товары и предложим три корзины по цене и удобству.

## Product Principles

1. Start from the user's task, not from catalog navigation.
2. Keep the first meaningful action available before requesting profile data.
3. Ask for delivery context only when it is needed to build real baskets.
4. Compare retailers as equal sources and explain checkout capability before the last step.
5. Keep tradeoffs human-readable and recommendations tied to the resolved intent.
6. Use pixel art as a consistent brand system, not as an isolated loader treatment.
7. Do not add product analytics in this scope.

## Scope

### Included

- Focused home screen and utility topbar.
- Short optional first-run value screen.
- Deferred delivery/address step after the first request.
- Neutral brand copy and metadata.
- Pixel-art identity across icon, onboarding, empty state, loader, success and sharing.
- Equal multi-retailer presentation.
- Request summary and editing on results.
- Intent-based recommendation.
- Human-readable price comparisons.
- Simplified result cards.
- Conversational follow-up on results.
- Profile UX fixes.
- Selected-basket empty state and copy cleanup.
- Social metadata and manifest.

### Excluded

- Product analytics backend or event collector.
- New retailer adapters or changes to retailer catalog semantics.
- Full catalog browsing.
- Favourites, deals, history and marketplace search.
- New auth providers.
- Payments or native checkout.
- A final trademarked brand name beyond the working name `Умная корзина`.

## Information Architecture

### Home

The home route is a focused AI utility.

Order:

1. Utility topbar with brand, delivery context and profile/help actions.
2. Compact value statement.
3. Task composer.
4. Task-oriented quick prompts.
5. Recent or example requests.

Remove marketplace chrome from the working product surface:

- decorative search button;
- five-item bottom navigation;
- gift FAB;
- `Любимое` and `Ещё` placeholders;
- product-category tiles that look like catalog navigation;
- oversized promotional hero.

Quick prompts should describe user goals rather than departments:

- `На неделю`;
- `Экономно`;
- `Для семьи`;
- `Без готовки`.

### Delivery context

The topbar reads the actual saved profile address.

With address:

```text
Доставка
Краснобогатырская, 90
```

Without address:

```text
Адрес не указан
Добавить
```

Clicking the delivery area opens the delivery step directly. It must not open an unrelated account section first.

### Results

Order:

1. Back/new-search action.
2. Resolved request summary.
3. `Изменить запрос` action.
4. Available retailer selector/summary.
5. Three strategy cards for the selected retailer.
6. Follow-up composer and quick follow-up actions.

### Selected basket

Order:

1. Back to variants.
2. Retailer, checkout capability and selected strategy.
3. Basket summary.
4. Editable items.
5. Warnings and freshness disclaimer.
6. Fixed checkout action.

## First-run Flow

### Initial visit

Show one optional full-screen value screen only:

```text
Соберём покупки вместо вас

Опишите задачу обычным языком.
Мы найдём реальные товары и предложим
три корзины по цене и удобству.

[ Попробовать ]
```

Include a pixel-art basket illustration.

The user can dismiss or continue. Both paths lead to the home composer. Do not require address, store selection, household size, exclusions or preferences before the user can see and use the main product.

### First request without address

The user writes a real request first. On submit, preserve the full draft and open the delivery step.

Flow:

`home composer -> delivery step -> available store context -> basket generation`

The delivery step contains:

- address autocomplete;
- automatic location lookup;
- resolved address;
- retailer availability/store selection where required;
- one clear continuation action.

The profile-preferences step is not mandatory in first-run. It remains available in Profile. A later non-blocking prompt may offer to save preferences after a successful basket, but this is not required for this change.

## Brand System

### Working name

Use `Умная корзина` in visible copy, document title and metadata. Remove `ВкусВилл Advisor` and `AI-планировщик корзины` from consumer-facing naming.

### Retailer naming

Retailer names appear only as sources:

- ВкусВилл;
- Лента;
- Пятёрочка.

Where relevant, add a neutral note that the product is an experimental independent service and is not an official retailer application.

### Pixel-art identity

Pixel art is an approved permanent part of the brand.

Reuse the existing basket and food language in:

1. app icon/favicon;
2. first-run illustration;
3. loader;
4. empty-results or empty-basket state;
5. success transition after baskets are ready or checkout is prepared;
6. OG image.

System controls continue to use Lucide icons. Remove decorative emoji from category/task shortcuts so the product does not mix emoji, pixel art and line icons at the same semantic level.

### Brand assets

Add:

- `/brand/icon.svg` or equivalent pixel-style vector icon;
- an app manifest;
- an OG image at 1200x630;
- `description`, Open Graph, Twitter, theme-color and apple-touch metadata;
- neutral title such as `Умная корзина — три варианта покупок под вашу задачу`.

Assets must be small and must not block first contentful paint. Existing sprite sheets should be lazy/preloaded only when the loader is about to be shown.

## Home Screen Design

### Topbar

The topbar contains:

- compact brand lockup;
- delivery context as a clickable control;
- profile control;
- optional help control.

It does not contain a fake catalog search action.

### Value statement

Use a compact utility headline:

```text
Что нужно купить?

Опишите задачу — сравним три варианта
по цене и времени на готовку.
```

Do not use `Что купить сегодня?`; the product supports several days and weekly planning.

Do not lead with `AI` in the user-facing promise.

### Composer

The composer remains the dominant action.

Default CTA:

`Подобрать 3 корзины`

Without address, the same CTA may display `Продолжить`, but the accessibility label must explain that the next step is the delivery address.

Task chips append editable fragments to the current request. They must look like prompt helpers, not catalog navigation.

## Multi-retailer Model

Retailers are equal sources, but the UI must avoid presenting nine undifferentiated baskets.

### Level 1: retailer selection

Show only retailers that returned a valid result or a meaningful recoverable status. Do not render empty zero-count tabs by default.

Each retailer option shows:

- retailer name;
- lowest available basket price;
- checkout capability.

Capabilities:

- `Автокорзина` — products can be transferred/opened automatically;
- `Список` — products are validated and copied for manual addition.

Example:

```text
ВкусВилл   от 3 120 ₽   Автокорзина
Лента      от 2 740 ₽   Список
```

### Level 2: strategies

Inside the selected retailer show exactly three strategies when available:

- Сбалансированная;
- Экономная;
- Быстрая.

If a strategy cannot satisfy its semantic promise, keep the existing safe fallback to `Альтернатива` and explain why.

## Results Header

Use:

```text
3 варианта корзины

Ужины на 3 дня
2 человека · до 3000 ₽ · без грибов

[ Изменить запрос ]
```

The summary is derived from the final resolved intent, not just the original text.

`Изменить запрос` returns focus to the results follow-up composer with the previous request context preserved. It must not wipe current results until a new request is submitted.

## Recommendation Logic

Recommendation follows the resolved intent:

- `priority = budget` -> Экономная;
- `priority = speed` -> Быстрая;
- `priority = balanced` -> Сбалансированная.

If the recommended strategy is unavailable or downgraded to `Альтернатива`, either recommend the closest valid strategy or omit the badge. Never always recommend `balanced`.

## Price Comparison Copy

Replace mathematical shorthand with plain language.

Use:

- `На 230 ₽ дороже`;
- `На 131 ₽ дешевле`;
- `Цена как у сбалансированной`.

The reference is the balanced strategy within the same retailer.

Colour semantics:

- cheaper: positive green;
- more expensive: neutral or warning;
- equal: muted neutral.

## Simplified Result Card

Each card has three information levels.

### Level 1

- title;
- optional recommendation badge;
- subtitle.

### Level 2

- price;
- one compact comparison line:
  - human-readable price delta;
  - item count;
  - cooking effort.

Example:

```text
2 740 ₽
На 131 ₽ дешевле · 7 товаров · больше готовки
```

### Level 3

- at most three preview products;
- one short tradeoff statement;
- CTA `Посмотреть состав`.

Remove:

- `черновик`;
- excessive metric pills;
- generic CTA `Открыть`;
- repeated nested surfaces around every sentence.

## Conversational Follow-up

Results include a compact composer:

```text
Что изменить?

[ Сделать дешевле, убрать рыбу…      ↑ ]
```

Quick actions:

- `Дешевле`;
- `Меньше готовки`;
- `Убрать продукт`;
- `На больше людей`.

Quick actions insert editable text and focus the composer. They do not submit automatically, preventing accidental expensive calls and allowing the user to complete ambiguous instructions.

Submitting follow-up:

- preserves previous intent;
- updates only explicitly changed constraints;
- keeps the selected retailer context where valid;
- shows the same loader;
- replaces results only after successful completion;
- preserves the prior results on recoverable failure.

## Selected Basket

### Copy

Replace `Checkout` with `Ваша корзина` or omit the kicker.

Show retailer and capability once in the basket header. Do not repeat store name and full address on every item row unless products genuinely come from different stores.

### Item row

Prioritize:

- thumbnail;
- product name;
- weight/pack information;
- price;
- quantity;
- replace;
- delete.

Freshness appears as secondary copy such as `Цена проверена в 14:35`.

### Empty state

If every item is removed:

```text
В корзине больше нет товаров

[ Вернуть последний товар ]
[ К вариантам ]
```

Disable checkout at zero items.

### Checkout capability

Make the difference visible before the final click.

VkusVill example:

`Открыть корзину во ВкусВилле`

Lenta example:

`Проверить и скопировать список Ленты`

Do not present a manual copied list as if it were an automatic retailer cart.

## Profile Fixes

1. Reuse `reverseGeocodeAddress` in the profile geolocation flow so successful location detection actually updates the address.
2. Remove automatic focus from the address field when opening Profile.
3. Remove duplicate `Профиль / Профиль` heading.
4. Stack email input and email login button on screens up to 420px.
5. Keep address, household size, exclusions and preferences as profile-level data.
6. Keep days, budget, meals and one-off priorities in BasketIntent only.

## Empty and Error States

Use the pixel basket for:

- no results;
- no products left;
- successful basket completion.

Error states remain practical and identify the failed layer without exposing provider jargon. Preserve the previous valid results when a follow-up fails.

## Accessibility

- Minimum 44px touch targets.
- Visible focus states.
- Functional keyboard navigation for address autocomplete, retailer selection and dialogs.
- Focus restoration after dialogs.
- Follow-up composer supports keyboard submit and has a visible label.
- Animations respect `prefers-reduced-motion`.
- No horizontal overflow at 320px.
- Pixel art is decorative unless it conveys state; decorative assets use empty alt text or `aria-hidden`.

## Technical Structure

Prefer small targeted modules rather than extending the already large `src/components.tsx`.

Suggested extraction:

- `src/config/brand.ts`;
- `src/components/home/HomeHeader.tsx`;
- `src/components/results/ResultsHeader.tsx`;
- `src/components/results/RetailerSelector.tsx`;
- `src/components/results/FollowUpComposer.tsx`;
- `src/components/results/BasketVariantCard.tsx`;
- `src/components/brand/PixelBasketMark.tsx`;
- supporting CSS modules/files consistent with the current project setup.

Existing domain/orchestration APIs should remain stable unless a small explicit addition is needed for follow-up or retailer capability presentation.

## Testing

### Unit/component tests

- neutral brand appears and VkusVill is no longer the app name;
- first run shows only the optional value screen;
- submit without address opens delivery step and preserves request draft;
- topbar uses profile address and shows empty-address state;
- geolocation updates the profile address through reverse geocoding;
- recommendation follows intent priority;
- price delta copy uses `дороже`, `дешевле`, or equal wording;
- empty retailer groups are hidden;
- result summary reflects final intent;
- follow-up preserves previous intent and results on failure;
- selected basket renders zero-item empty state and disables checkout;
- profile does not autofocus address;
- email auth controls stack at small viewport widths.

### Verification

Run:

- existing unit test suite;
- typecheck;
- production build;
- visual checks at 320x568, 390x844 and desktop;
- keyboard-only pass through onboarding, address, results, follow-up, profile and basket editing;
- reduced-motion pass for loader and success animation.

## Acceptance Criteria

1. The product reads as a focused AI basket utility, not an unfinished marketplace.
2. The visible brand is neutral and retailers are equal sources.
3. A first-time user can type a real task before providing an address.
4. Address is requested only when the first basket request needs catalog context.
5. The actual profile address appears in the topbar.
6. Pixel art appears consistently in at least onboarding, loader, app icon and one empty/success state.
7. Results show the resolved request and `Изменить запрос`.
8. Recommendation follows intent priority.
9. Price difference is written in plain Russian.
10. Result cards have a clear hierarchy and CTA `Посмотреть состав`.
11. Results support conversational follow-up with four quick actions.
12. Only available retailer results are selectable, and checkout capability is visible.
13. Profile geolocation actually resolves and saves an address.
14. Empty basket state is handled and checkout is disabled at zero items.
15. No analytics backend or new event system is added in this scope.
