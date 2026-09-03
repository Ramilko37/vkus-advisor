# Focused AI Utility Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current marketplace-like prototype into the neutral, focused AI basket utility “Умная корзина”, with deferred delivery setup, equal retailer comparison, intent-aware basket recommendations, conversational follow-up, and a consistent pixel-art brand system.

**Architecture:** Keep the existing React/Vite application, profile repository, catalog adapters, and basket orchestration. Extract the redesigned home and results surfaces from `src/components.tsx` into focused modules, centralize brand and retailer metadata, simplify the onboarding state machine, and make planner updates atomic so recoverable follow-up failures retain the last valid baskets.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest 2, Testing Library, existing CSS token system, Lucide React, existing Node/Vercel API routes.

**Spec:** `docs/superpowers/specs/2026-09-01-focused-ai-utility-redesign-design.md`

## Global Constraints

- The visible product name is `Умная корзина`; `ВкусВилл` is a retailer source, not the application brand.
- Centralize visible brand copy in `src/config/brand.ts`.
- Keep VkusVill, Lenta, and Pyaterochka as equal retailer sources; do not imply official affiliation.
- Do not add a product-analytics backend, event collector, or new analytics dependency.
- Do not add new retailer adapters or change retailer search semantics.
- Do not add catalog browsing, favourites, deals, history, payments, or native checkout.
- Ask for delivery context only after the user submits a real basket request or explicitly opens delivery settings.
- Pixel art is a permanent brand layer; Lucide remains the control-icon layer; decorative emoji must not be used as UI identity.
- Recommendation must follow resolved `BasketIntent.priority`, never always `balanced`.
- Recoverable follow-up failure must keep the last valid `intent`, `variants`, and `retailerResults` visible.
- Minimum touch target is 44px; no horizontal overflow at 320px; animations respect `prefers-reduced-motion`.
- Existing catalog credentials, provider routing, and server-only secrets remain unchanged.
- Use `pnpm test`, `pnpm lint`, and `pnpm build` as the final automated verification commands.

---

## File Structure

### New files

- `src/config/brand.ts` — centralized product name, description, independent-service note, and metadata copy.
- `src/config/brand.test.ts` — protects neutral naming and metadata copy.
- `src/config/retailers.ts` — retailer labels, checkout capability, and manual-list behavior.
- `src/config/retailers.test.ts` — protects capability mapping.
- `src/services/addressPresentation.ts` — converts a full saved address into a compact topbar label.
- `src/services/addressPresentation.test.ts` — covers DaData-style and fallback address formats.
- `src/services/retailerPresentation.ts` — builds only selectable retailer options and computes lowest prices.
- `src/services/retailerPresentation.test.ts` — covers hiding empty groups and neutral ordering.
- `src/components/brand/PixelBasketMark.tsx` — lightweight pixel-style SVG mark for onboarding, empty states, and success states.
- `src/components/brand/pixel-basket-mark.css` — size and reduced-motion rules for the mark.
- `src/components/home/HomeHeader.tsx` — focused utility topbar and compact value statement.
- `src/components/home/home.css` — home-only layout and task shortcut styling.
- `src/components/results/ResultsHeader.tsx` — resolved intent summary and edit action.
- `src/components/results/RetailerSelector.tsx` — retailer-level selector with minimum price and checkout capability.
- `src/components/results/FollowUpComposer.tsx` — editable follow-up field and four quick actions.
- `src/components/results/BasketVariantCard.tsx` — simplified strategy card.
- `src/components/results/results.css` — results header, retailer selector, cards, and follow-up styles.
- `src/components/results/results.test.tsx` — component tests for summary, recommendation, retailer selector, cards, and follow-up.
- `public/brand/icon.svg` — small pixel-style app/fav icon.
- `public/brand/og-image.svg` — 1200×630 neutral social preview.
- `public/manifest.webmanifest` — installable app metadata.

### Existing files to modify

- `index.html` — neutral title, description, social metadata, app icon, manifest, theme color.
- `src/types/domain.ts` — onboarding schema v2 and optional checkout URL.
- `src/services/onboardingRepository.ts` and tests — migrate v1 state and persist v2.
- `src/hooks/useOnboarding.ts` and tests — value-only first run plus deferred delivery step.
- `src/components/onboarding/OnboardingFlow.tsx` and tests — remove mandatory profile step and use pixel art.
- `src/components/onboarding/onboarding-flow.css` — simplify the first-run screen and delivery sheet.
- `src/hooks/useBasketPlanner.ts` and profile tests — profile override on submit and atomic valid-result replacement.
- `src/App.tsx` and `src/App.test.tsx` — automatically continue a pending request after delivery setup.
- `src/components.tsx` and `src/components.profile.test.tsx` — integrate extracted modules; remove marketplace chrome; fix profile and basket behavior.
- `src/services/requestCopy.ts` and tests — resolved request title/summary copy.
- `src/services/variantPresentation.ts` and tests — human price copy and compact card metadata.
- `src/styles.css` — remove obsolete marketplace rules and add profile/basket responsive fixes.
- `src/components/loader/FullscreenLoader.tsx` and tests — reuse the brand mark in the finishing state without removing the food-rain loader.
- `PRODUCT.md`, `DESIGN.md`, and `README.md` — align product and visual direction with the neutral focused utility.

---

### Task 1: Establish the neutral brand foundation and metadata

**Files:**
- Create: `src/config/brand.ts`
- Create: `src/config/brand.test.ts`
- Create: `src/components/brand/PixelBasketMark.tsx`
- Create: `src/components/brand/pixel-basket-mark.css`
- Create: `public/brand/icon.svg`
- Create: `public/brand/og-image.svg`
- Create: `public/manifest.webmanifest`
- Modify: `index.html`

**Interfaces:**
- Produces: `BRAND` constant with `name`, `title`, `description`, and `independentNote`.
- Produces: `PixelBasketMark({ size?, className?, state?, decorative? })`.
- Consumes: no application state.

- [ ] **Step 1: Write the brand contract test**

Create `src/config/brand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

describe("BRAND", () => {
  it("uses a neutral consumer-facing name", () => {
    expect(BRAND.name).toBe("Умная корзина");
    expect(BRAND.title).toContain("Умная корзина");
    expect(BRAND.title).not.toContain("ВкусВилл Advisor");
    expect(BRAND.description).toContain("три");
  });

  it("states that the service is independent", () => {
    expect(BRAND.independentNote).toContain("Независимый");
    expect(BRAND.independentNote).toContain("не является официальным");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
pnpm test -- src/config/brand.test.ts
```

Expected: FAIL because `src/config/brand.ts` does not exist.

- [ ] **Step 3: Add the centralized brand config**

Create `src/config/brand.ts`:

```ts
export const BRAND = {
  name: "Умная корзина",
  title: "Умная корзина — три варианта покупок под вашу задачу",
  description: "Опишите задачу обычным языком. Сервис найдёт реальные товары и предложит три корзины по цене и удобству.",
  independentNote: "Независимый экспериментальный сервис. Не является официальным приложением магазинов.",
} as const;
```

- [ ] **Step 4: Add the lightweight pixel basket component**

Create `src/components/brand/PixelBasketMark.tsx` with this public API:

```tsx
import "./pixel-basket-mark.css";

type PixelBasketMarkProps = {
  size?: number;
  className?: string;
  state?: "idle" | "empty" | "success";
  decorative?: boolean;
};

export function PixelBasketMark({
  size = 72,
  className = "",
  state = "idle",
  decorative = true,
}: PixelBasketMarkProps) {
  const label = decorative ? undefined : state === "success" ? "Корзина готова" : "Пустая корзина";

  return (
    <svg
      className={`pixel-basket-mark pixel-basket-mark--${state} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={label}
    >
      <rect x="14" y="25" width="36" height="6" rx="1" />
      <rect x="18" y="31" width="28" height="20" rx="2" />
      <rect x="23" y="18" width="6" height="7" rx="1" />
      <rect x="35" y="18" width="6" height="7" rx="1" />
      <rect className="pixel-basket-mark__accent" x="25" y="36" width="6" height="6" rx="1" />
      <rect className="pixel-basket-mark__accent" x="34" y="36" width="6" height="6" rx="1" />
    </svg>
  );
}
```

Create `pixel-basket-mark.css` with `fill: currentColor`, an accent fill using `var(--deal)`, a short success bounce, and a `prefers-reduced-motion` override that removes animation.

- [ ] **Step 5: Add static brand assets**

Create `public/brand/icon.svg` using the same 64×64 geometry, a `#0d3424` background, a white basket, and `#85d90f` accent pixels.

Create `public/brand/og-image.svg` with:

- `viewBox="0 0 1200 630"`;
- pale green background `#eef2ea`;
- the pixel basket mark on the left;
- title `Умная корзина`;
- subtitle `Три варианта покупок под вашу задачу`;
- three short labels `Баланс`, `Экономия`, `Меньше готовки`;
- no retailer logo or official-brand claim.

Create `public/manifest.webmanifest`:

```json
{
  "name": "Умная корзина",
  "short_name": "Корзина",
  "description": "Три варианта покупок под вашу задачу",
  "lang": "ru",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#eef2ea",
  "theme_color": "#0d3424",
  "icons": [
    {
      "src": "/brand/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 6: Replace document metadata**

Update `index.html` so the `<head>` includes:

```html
<title>Умная корзина — три варианта покупок под вашу задачу</title>
<meta
  name="description"
  content="Опишите задачу обычным языком. Сервис найдёт реальные товары и предложит три корзины по цене и удобству."
/>
<meta name="theme-color" content="#0d3424" />
<link rel="icon" href="/brand/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/brand/icon.svg" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Умная корзина" />
<meta property="og:description" content="Три варианта покупок под вашу задачу." />
<meta property="og:image" content="/brand/og-image.svg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Умная корзина" />
<meta name="twitter:description" content="Три варианта покупок под вашу задачу." />
<meta name="twitter:image" content="/brand/og-image.svg" />
```

Remove the old inline green basket favicon and the `ВкусВилл Advisor` title.

- [ ] **Step 7: Add a metadata regression test**

Append to `src/config/brand.test.ts`:

```ts
import { readFileSync } from "node:fs";

it("uses neutral document metadata", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  expect(html).toContain("Умная корзина");
  expect(html).toContain('property="og:image"');
  expect(html).toContain('rel="manifest"');
  expect(html).not.toContain("ВкусВилл Advisor");
});
```

- [ ] **Step 8: Run the focused tests**

Run:

```bash
pnpm test -- src/config/brand.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the brand foundation**

```bash
git add index.html public/brand public/manifest.webmanifest src/config/brand.ts src/config/brand.test.ts src/components/brand
git commit -m "feat: establish neutral basket brand"
```

---

### Task 2: Simplify first-run onboarding to value plus deferred delivery

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/services/onboardingRepository.ts`
- Modify: `src/services/onboardingRepository.test.ts`
- Modify: `src/hooks/useOnboarding.ts`
- Modify: `src/hooks/useOnboarding.test.ts`
- Modify: `src/components/onboarding/OnboardingFlow.tsx`
- Modify: `src/components/onboarding/OnboardingFlow.test.tsx`
- Modify: `src/components/onboarding/onboarding-flow.css`

**Interfaces:**
- Produces: `OnboardingStep = "value" | "delivery"`.
- Produces: onboarding state schema version `2`.
- Produces hook methods `finishIntro()`, `replay()`, `openDelivery(requestDraft?)`, `completeDelivery()`, and `dismiss()`.
- Produces `OnboardingFlow` callback `onDeliveryComplete(profile, requestDraft)`.

- [ ] **Step 1: Write the v1-to-v2 migration test**

In `src/services/onboardingRepository.test.ts`, add:

```ts
it("migrates the removed profile step without reopening onboarding", () => {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
    version: 1,
    status: "in_progress",
    step: "profile",
    requestDraft: "",
    resultsHintDismissed: false,
    basketEditHintDismissed: false,
  }));

  expect(loadOnboardingState()).toEqual(expect.objectContaining({
    version: 2,
    status: "completed",
    step: "value",
  }));
});
```

- [ ] **Step 2: Run the migration test**

Run:

```bash
pnpm test -- src/services/onboardingRepository.test.ts
```

Expected: FAIL because the repository still returns version `1` and step `profile`.

- [ ] **Step 3: Update onboarding domain types**

In `src/types/domain.ts`:

```ts
export type OnboardingStep = "value" | "delivery";

export interface OnboardingState {
  version: 2;
  status: OnboardingStatus;
  step: OnboardingStep;
  requestDraft: string;
  completedAt?: string;
  resultsHintDismissed: boolean;
  basketEditHintDismissed: boolean;
}
```

- [ ] **Step 4: Implement explicit v1 migration**

In `src/services/onboardingRepository.ts`:

- change `ONBOARDING_STORAGE_KEY` to `smart-basket:onboarding:v2`;
- return version `2` from `createInitialOnboardingState()`;
- when reading the legacy key `vkusvill-advisor:onboarding:v1`, map:
  - `not_started` → v2 `not_started/value`;
  - `in_progress/delivery` → v2 `in_progress/delivery` with the same request draft;
  - `in_progress/profile` → v2 `completed/value`;
  - `completed` → v2 `completed/value`;
  - `dismissed` → v2 `dismissed/value`;
- save only the v2 key.

Use a named helper:

```ts
export function migrateOnboardingState(value: unknown): OnboardingState
```

so the migration can be unit-tested without browser storage.

- [ ] **Step 5: Define the simplified hook behavior in tests**

In `src/hooks/useOnboarding.test.ts`, add tests that assert:

```ts
expect(result.current.visible).toBe(true);
expect(result.current.state.step).toBe("value");

act(() => result.current.finishIntro());
expect(result.current.visible).toBe(false);

act(() => result.current.openDelivery("ужины на три дня"));
expect(result.current.visible).toBe(true);
expect(result.current.state).toEqual(expect.objectContaining({
  step: "delivery",
  requestDraft: "ужины на три дня",
}));

act(() => result.current.completeDelivery());
expect(result.current.visible).toBe(false);
expect(result.current.state.requestDraft).toBe("");
```

- [ ] **Step 6: Implement the new onboarding hook API**

Replace the old `start`, `goTo`, and `back` methods in `useOnboarding` with:

```ts
finishIntro: () => update((current) => ({
  ...current,
  status: "completed",
  step: "value",
  completedAt: current.completedAt ?? new Date().toISOString(),
})),
replay: () => update((current) => ({ ...current, status: "in_progress", step: "value" })),
openDelivery: (requestDraft = "") => update((current) => ({
  ...current,
  status: "in_progress",
  step: "delivery",
  requestDraft,
})),
completeDelivery: () => update((current) => ({
  ...current,
  status: "completed",
  step: "value",
  requestDraft: "",
  completedAt: current.completedAt ?? new Date().toISOString(),
})),
dismiss: () => update((current) => ({ ...current, status: "dismissed", step: "value" })),
```

Keep the results and basket hint dismissal methods.

- [ ] **Step 7: Write the simplified flow component test**

In `OnboardingFlow.test.tsx`, add a test that renders the first visit and verifies:

```ts
expect(screen.getByRole("heading", { name: "Соберём покупки вместо вас" })).toBeInTheDocument();
expect(screen.queryByText(/Шаг 1 из/)).not.toBeInTheDocument();
expect(screen.queryByRole("heading", { name: "Что учитывать в ваших корзинах?" })).not.toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));
expect(onboarding.finishIntro).toHaveBeenCalled();
```

Add a delivery test that clicks `Продолжить` and expects:

```ts
expect(onDeliveryComplete).toHaveBeenCalledWith(
  expect.objectContaining({ address: "Москва, Вавилова 19" }),
  "ужины на три дня",
);
```

- [ ] **Step 8: Remove the mandatory profile step from `OnboardingFlow`**

Change the props to:

```ts
interface OnboardingFlowProps {
  onboarding: OnboardingController;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void | Promise<void>;
  onDeliveryComplete: (profile: UserProfile, requestDraft: string) => void | Promise<void>;
}
```

Render only:

- `ValueStep` for `value`;
- `DeliveryStep` for `delivery`.

Remove the progress bar, `steps` array, `ProfileStep`, and onboarding-only `TagEditor`.

The value screen must use:

```tsx
<PixelBasketMark size={88} state="idle" />
<h1>Соберём покупки вместо вас</h1>
<p>Опишите задачу обычным языком. Мы найдём реальные товары и предложим три корзины по цене и удобству.</p>
<button type="button" onClick={onboarding.finishIntro}>Попробовать</button>
```

The close button still calls `dismiss()`.

- [ ] **Step 9: Make delivery continuation save and resume**

Inside the delivery step continuation:

```ts
const next = normalizeProfile(draft);
await onProfileChange(next);
const pendingRequest = onboarding.state.requestDraft.trim();
onboarding.completeDelivery();
await onDeliveryComplete(next, pendingRequest);
```

Do not route through a profile-preferences screen.

- [ ] **Step 10: Simplify onboarding CSS**

Remove the three-step progress styles and profile-step-only rules from `onboarding-flow.css`.

Keep:

- full-height value screen;
- compact sticky header;
- pixel mark;
- address autocomplete;
- store selection;
- fixed mobile CTA;
- 44px controls;
- 320px overflow protection.

- [ ] **Step 11: Run onboarding tests**

```bash
pnpm test -- src/services/onboardingRepository.test.ts src/hooks/useOnboarding.test.ts src/components/onboarding/OnboardingFlow.test.tsx
```

Expected: PASS.

- [ ] **Step 12: Commit the onboarding simplification**

```bash
git add src/types/domain.ts src/services/onboardingRepository* src/hooks/useOnboarding* src/components/onboarding
git commit -m "feat: defer delivery setup until first request"
```

---

### Task 3: Allow a freshly saved delivery profile to start the pending request

**Files:**
- Modify: `src/hooks/useBasketPlanner.ts`
- Modify: `src/hooks/useBasketPlanner.profile.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Changes: `submit(message: string, profileOverride?: UserProfile): Promise<void>`.
- Changes: internal `runWorkflow(message, effectiveProfile)`.
- Consumes: `OnboardingFlow.onDeliveryComplete(profile, requestDraft)` from Task 2.
- Guarantees: a successful run replaces intent and baskets atomically; a recoverable failure retains the last valid result set.

- [ ] **Step 1: Write the profile-override planner test**

In `useBasketPlanner.profile.test.ts`, add a test with an empty hook profile and a saved override:

```ts
const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

await act(async () => {
  await result.current.submit("ужины на три дня", {
    ...DEFAULT_PROFILE,
    address: "Москва, Вавилова 19",
    lentaStoreId: "525",
  });
});

expect(createCatalogClient).toHaveBeenCalledWith(
  expect.objectContaining({
    address: "Москва, Вавилова 19",
    lentaStoreId: "525",
  }),
  expect.any(AbortSignal),
);
```

- [ ] **Step 2: Write the atomic failure regression test**

Set an existing ready state through session storage or `mockResults()`, make the next basket composition reject, submit a follow-up, and assert:

```ts
expect(result.current.state.error).not.toBeNull();
expect(result.current.state.variants).toEqual(previousVariants);
expect(result.current.state.intent).toEqual(previousIntent);
```

- [ ] **Step 3: Run the planner tests**

```bash
pnpm test -- src/hooks/useBasketPlanner.profile.test.ts
```

Expected: FAIL because `submit` does not accept a profile override and the in-progress intent is committed before basket success.

- [ ] **Step 4: Thread `effectiveProfile` through the workflow**

Change signatures:

```ts
const runWorkflow = useCallback(async (message: string, effectiveProfile: UserProfile) => {
  // use effectiveProfile for analyzeIntent defaults, catalog creation,
  // address fingerprinting, and profile catalog key
}, [llm, sessionId, state]);

const submit = useCallback(async (message: string, profileOverride?: UserProfile) => {
  const effectiveProfile = profileOverride ?? profile;
  // validation
  await runWorkflow(trimmed, effectiveProfile);
}, [profile, runWorkflow, state.intent]);
```

Use `effectiveProfile` in:

- `analyzeIntent(..., effectiveProfile)`;
- `getCatalogForProfile(..., effectiveProfile, ...)`;
- `buildCatalogFingerprint(intent, effectiveProfile.address)`;
- missing-address validation.

- [ ] **Step 5: Commit intent only at a safe boundary**

Remove the unconditional `dispatch({ type: "intent", intent: intentResult.data })` before catalog search.

Use:

```ts
if (intentResult.data.needsClarification && intentResult.data.clarificationQuestion) {
  dispatch({ type: "intent", intent: intentResult.data });
  dispatch({ type: "message", message: clarificationMessage });
  return;
}
```

For a complete request, commit the new intent only inside the existing `ready` action together with new variants and retailer results.

- [ ] **Step 6: Keep previous results on recoverable failure**

Do not clear `variants`, `retailerResults`, or the previous valid `intent` when dispatching `stage` or `error`.

Add a reducer assertion test if no existing reducer-level test covers this behavior.

- [ ] **Step 7: Connect delivery completion in `App.tsx`**

Pass:

```tsx
<OnboardingFlow
  onboarding={onboarding}
  profile={authProfile.profile}
  onProfileChange={authProfile.updateProfile}
  onDeliveryComplete={async (nextProfile, requestDraft) => {
    if (!requestDraft) return;
    await planner.submit(requestDraft, nextProfile);
  }}
/>
```

Change home submission from `onboarding.open("delivery", request)` to `onboarding.openDelivery(request)`.

- [ ] **Step 8: Replace the old two-click App test**

Update the existing “preserves a Home request through required delivery setup” test:

- dismiss the optional value screen;
- enter `ужины на три дня`;
- click `Продолжить`;
- fill and resolve the address;
- click delivery `Продолжить`;
- assert the onboarding closes;
- assert `mocks.submit` was called automatically with the request and saved profile;
- do not click a removed profile-step button;
- do not click the home submit button a second time.

Expected assertion:

```ts
await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(
  "ужины на три дня",
  expect.objectContaining({
    address: "Москва, Вавилова 19",
    lentaStoreId: "525",
  }),
));
```

- [ ] **Step 9: Run App and planner tests**

```bash
pnpm test -- src/App.test.tsx src/hooks/useBasketPlanner.profile.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit the pending-request continuation**

```bash
git add src/App.tsx src/App.test.tsx src/hooks/useBasketPlanner.ts src/hooks/useBasketPlanner.profile.test.ts
git commit -m "feat: resume basket request after delivery setup"
```

---

### Task 4: Replace marketplace chrome with a focused home utility

**Files:**
- Create: `src/services/addressPresentation.ts`
- Create: `src/services/addressPresentation.test.ts`
- Create: `src/components/home/HomeHeader.tsx`
- Create: `src/components/home/home.css`
- Modify: `src/components.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `formatDeliveryAddress(address: string): string | null`.
- Produces: `HomeHeader({ profile, onOpenDelivery, onOpenHelp, profileControl })`.
- Consumes: `BRAND` from Task 1.
- Consumes: `onboarding.openDelivery("")` from Task 2.

- [ ] **Step 1: Write compact address tests**

Create `src/services/addressPresentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDeliveryAddress } from "./addressPresentation";

describe("formatDeliveryAddress", () => {
  it("formats a DaData-style Moscow address", () => {
    expect(formatDeliveryAddress("г Москва, ул Краснобогатырская, д 90, стр 2"))
      .toBe("Краснобогатырская, 90с2");
  });

  it("keeps a readable fallback", () => {
    expect(formatDeliveryAddress("Москва, Вавилова 19")).toBe("Вавилова 19");
  });

  it("returns null for an empty address", () => {
    expect(formatDeliveryAddress("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the address tests**

```bash
pnpm test -- src/services/addressPresentation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement compact address formatting**

Create `src/services/addressPresentation.ts`:

```ts
export function formatDeliveryAddress(value: string): string | null {
  const address = value.replace(/\s+/g, " ").trim();
  if (!address) return null;

  const streetMatch = address.match(/(?:ул(?:ица)?\.?\s*)?([^,]+?)(?=,\s*(?:д(?:ом)?\.?\s*)?\d)/i);
  const houseMatch = address.match(/(?:д(?:ом)?\.?\s*)(\d+[а-яА-Я]?)/i);
  const buildingMatch = address.match(/(?:стр(?:оение)?\.?\s*)(\d+)/i);

  if (streetMatch && houseMatch) {
    const street = streetMatch[1].replace(/^г\s+\S+,\s*/i, "").trim();
    return `${street}, ${houseMatch[1]}${buildingMatch ? `с${buildingMatch[1]}` : ""}`;
  }

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(", ").replace(/^ул(?:ица)?\.?\s*/i, "");
}
```

- [ ] **Step 4: Write the focused home integration assertions**

In `App.test.tsx`, after dismissing the intro, assert:

```ts
expect(screen.getByText("Умная корзина")).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Что нужно купить?" })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Поиск" })).not.toBeInTheDocument();
expect(screen.queryByRole("navigation", { name: "Основная навигация" })).not.toBeInTheDocument();
expect(screen.queryByText("Молочное")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: /Адрес не указан/ })).toBeInTheDocument();
```

Add an addressed-profile case:

```ts
expect(screen.getByRole("button", { name: /Краснобогатырская, 90с2/ })).toBeInTheDocument();
```

- [ ] **Step 5: Create `HomeHeader`**

`HomeHeader.tsx` must render:

```tsx
<header className="home-header">
  <div className="home-utility-bar">
    <div className="brand-lockup">
      <PixelBasketMark size={36} />
      <strong>{BRAND.name}</strong>
    </div>

    <button type="button" className="delivery-control" onClick={onOpenDelivery}>
      <span>{compactAddress ? "Доставка" : "Адрес не указан"}</span>
      <strong>{compactAddress ?? "Добавить"}</strong>
    </button>

    <div className="home-utility-actions">
      {profileControl}
      <button type="button" onClick={onOpenHelp} aria-label="Как это работает">
        <CircleHelp />
      </button>
    </div>
  </div>

  <div className="home-value">
    <h1>Что нужно купить?</h1>
    <p>Опишите задачу — сравним три варианта по цене и времени на готовку.</p>
  </div>
</header>
```

The delivery control’s accessible name must include the displayed address or `Адрес не указан, добавить`.

- [ ] **Step 6: Replace department shortcuts with task shortcuts**

In `src/components.tsx`, replace `categoryShortcuts` with:

```ts
const taskShortcuts = [
  { label: "На неделю", fragment: "на неделю" },
  { label: "Экономно", fragment: "максимально экономно" },
  { label: "Для семьи", fragment: "для семьи" },
  { label: "Без готовки", fragment: "почти без готовки" },
];
```

Render them under a visible label `Быстро добавить`.

Remove decorative emoji and the `Молочное / Мясо / Овощи / Готовое` category tiles.

- [ ] **Step 7: Remove fake marketplace navigation**

Delete from `src/components.tsx` and JSX integration:

- search icon button in the header;
- `BottomNav`;
- gift FAB;
- `Главная / Корзина / Любимое / Ещё` marketplace navigation;
- oversized green `hero-offer`;
- `AI-планировщик корзины`;
- `Что купить сегодня?`.

- [ ] **Step 8: Integrate the home header and delivery control**

In `AppShell`, render `HomeHeader` only on `home`.

Pass a callback from `App.tsx` that calls:

```ts
onboarding.openDelivery("")
```

Keep `ProfileControl`, but render its trigger inside the header instead of absolute positioning. Add a `triggerOnly` or `className` prop only if required; do not duplicate profile state.

- [ ] **Step 9: Rewrite home CSS**

In `home.css` and `styles.css`:

- remove absolute `.profile-trigger` and `.onboarding-trigger` placement;
- remove `.hero-offer`, `.hero-basket`, `.category-shortcuts`, and `.bottom-nav` rules;
- keep the composer as the dominant white surface;
- set home max width to `560px`;
- stack value statement above composer;
- wrap task shortcuts at 320px instead of horizontal clipping;
- preserve 44px controls and safe-area padding.

- [ ] **Step 10: Run home tests**

```bash
pnpm test -- src/services/addressPresentation.test.ts src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit the focused home**

```bash
git add src/components/home src/services/addressPresentation* src/components.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: focus home on basket requests"
```

---

### Task 5: Centralize retailer capability and build selectable retailer options

**Files:**
- Create: `src/config/retailers.ts`
- Create: `src/config/retailers.test.ts`
- Create: `src/services/retailerPresentation.ts`
- Create: `src/services/retailerPresentation.test.ts`
- Create: `src/components/results/RetailerSelector.tsx`
- Modify: `src/components/results/results.css`
- Modify: `src/types/domain.ts`

**Interfaces:**
- Produces: `RetailerKey`.
- Produces: `CheckoutCapability = "auto-cart" | "manual-list"`.
- Produces: `RETAILERS`.
- Produces: `buildRetailerOptions(variants, retailerResults): RetailerOption[]`.
- Produces: `RetailerSelector({ options, activeKey, onSelect })`.
- Changes: `CheckoutResult.url` from required to optional.

- [ ] **Step 1: Write retailer capability tests**

Create `src/config/retailers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RETAILERS } from "./retailers";

describe("RETAILERS", () => {
  it("treats retailers as sources rather than product brands", () => {
    expect(RETAILERS.vkusvill.label).toBe("ВкусВилл");
    expect(RETAILERS.lenta.label).toBe("Лента");
    expect(RETAILERS.pyaterochka.label).toBe("Пятёрочка");
  });

  it("does not claim automatic checkout where the current product only supports a list", () => {
    expect(RETAILERS.vkusvill.capability).toBe("auto-cart");
    expect(RETAILERS.lenta.capability).toBe("manual-list");
    expect(RETAILERS.pyaterochka.capability).toBe("manual-list");
  });
});
```

- [ ] **Step 2: Create retailer config**

Create `src/config/retailers.ts`:

```ts
import type { NormalizedProduct } from "../types/domain";

export type RetailerKey = NonNullable<NormalizedProduct["retailer"]>;
export type CheckoutCapability = "auto-cart" | "manual-list";

export const RETAILERS: Record<RetailerKey, {
  label: string;
  capability: CheckoutCapability;
  capabilityLabel: string;
}> = {
  vkusvill: { label: "ВкусВилл", capability: "auto-cart", capabilityLabel: "Автокорзина" },
  lenta: { label: "Лента", capability: "manual-list", capabilityLabel: "Список" },
  pyaterochka: { label: "Пятёрочка", capability: "manual-list", capabilityLabel: "Список" },
  demo: { label: "Демо", capability: "manual-list", capabilityLabel: "Пример" },
};
```

- [ ] **Step 3: Write retailer-option tests**

Create `src/services/retailerPresentation.test.ts` with fixtures and assert:

```ts
const options = buildRetailerOptions(variants, [
  readyResult("vkusvill", 3),
  readyResult("lenta", 3),
  readyResult("pyaterochka", 0),
]);

expect(options.map((option) => option.key)).toEqual(["lenta", "vkusvill"]);
expect(options[0]).toEqual(expect.objectContaining({
  minPriceRub: 2740,
  capabilityLabel: "Список",
}));
```

Use basket totals that make Lenta objectively cheaper so the expected neutral order is minimum price ascending.

Add a test that zero-variant and failed groups are not selectable.

- [ ] **Step 4: Implement retailer-option construction**

Create `src/services/retailerPresentation.ts`:

```ts
import { RETAILERS, type RetailerKey } from "../config/retailers";
import type { BasketVariant, RetailerResult } from "../types/domain";

export type RetailerOption = {
  key: RetailerKey;
  label: string;
  capability: "auto-cart" | "manual-list";
  capabilityLabel: string;
  minPriceRub: number;
  variants: BasketVariant[];
  result?: RetailerResult;
};

export function buildRetailerOptions(
  variants: BasketVariant[],
  retailerResults: RetailerResult[] = [],
): RetailerOption[] {
  const resultMap = new Map(retailerResults.map((result) => [result.retailer, result]));
  const grouped = new Map<RetailerKey, BasketVariant[]>();

  for (const variant of variants) {
    const key = variant.retailer ?? "demo";
    grouped.set(key, [...(grouped.get(key) ?? []), variant]);
  }

  return Array.from(grouped, ([key, group]) => ({
    key,
    label: RETAILERS[key].label,
    capability: RETAILERS[key].capability,
    capabilityLabel: RETAILERS[key].capabilityLabel,
    minPriceRub: Math.min(...group.map((variant) => variant.totalRub)),
    variants: group,
    result: resultMap.get(key),
  }))
    .filter((option) => option.variants.length > 0)
    .sort((left, right) => left.minPriceRub - right.minPriceRub || left.label.localeCompare(right.label, "ru"));
}
```

- [ ] **Step 5: Make checkout URL optional**

Change:

```ts
export interface CheckoutResult {
  url?: string;
  items?: BasketItem[];
}
```

This allows a validated manual list to complete without pretending that it created an automatic retailer cart.

- [ ] **Step 6: Create `RetailerSelector`**

Render each option as a button with:

```text
Лента
от 2 740 ₽ · Список
```

Requirements:

- `role="tablist"` on the container;
- `role="tab"` on each option;
- `aria-selected`;
- keyboard focus is native button focus;
- no zero-count badges;
- no empty retailer tabs;
- selected state uses one border/background change, not a saturated full card.

- [ ] **Step 7: Run retailer tests**

```bash
pnpm test -- src/config/retailers.test.ts src/services/retailerPresentation.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit retailer presentation**

```bash
git add src/config/retailers* src/services/retailerPresentation* src/components/results/RetailerSelector.tsx src/components/results/results.css src/types/domain.ts
git commit -m "feat: present retailers as equal basket sources"
```

---

### Task 6: Build the resolved-results header and simplified strategy cards

**Files:**
- Modify: `src/services/requestCopy.ts`
- Modify: `src/services/requestCopy.test.ts`
- Modify: `src/services/variantPresentation.ts`
- Modify: `src/services/variantPresentation.test.ts`
- Create: `src/components/results/ResultsHeader.tsx`
- Create: `src/components/results/BasketVariantCard.tsx`
- Create: `src/components/results/results.test.tsx`
- Modify: `src/components/results/results.css`
- Modify: `src/components.tsx`

**Interfaces:**
- Produces: `summarizeIntentTitle(intent): string`.
- Produces: `summarizeIntentLine(intent): string`.
- Changes: `VariantPresentation` to include plain-language `priceDeltaLabel`, `priceDeltaTone`, `itemCountLabel`, and `cookingLabel`.
- Produces: `recommendedStrategy(intent, variants): BasketPriority | null`.
- Consumes: `RetailerOption` from Task 5.

- [ ] **Step 1: Write resolved intent copy tests**

In `requestCopy.test.ts`:

```ts
expect(summarizeIntentTitle(intent)).toBe("Ужины на 3 дня");
expect(summarizeIntentLine(intent)).toBe("2 человека · до 3 000 ₽ · без грибов");
```

Also test multiple meals:

```ts
expect(summarizeIntentTitle({ ...intent, meals: ["завтрак", "ужин"] }))
  .toBe("Корзина на 3 дня");
```

- [ ] **Step 2: Implement resolved intent copy**

Add to `requestCopy.ts`:

```ts
const mealTitles: Record<string, string> = {
  завтрак: "Завтраки",
  обед: "Обеды",
  ужин: "Ужины",
};

export function summarizeIntentTitle(intent: BasketIntent) {
  const title = intent.meals.length === 1
    ? mealTitles[intent.meals[0].toLocaleLowerCase("ru-RU")] ?? capitalize(intent.meals[0])
    : "Корзина";
  return `${title} на ${intent.days} ${pluralizeDay(intent.days)}`;
}

export function summarizeIntentLine(intent: BasketIntent) {
  return [
    peopleLabel(intent.people),
    intent.budgetRub ? `до ${formatRub(intent.budgetRub)} ₽` : "",
    ...intent.excludedIngredients.slice(0, 2).map((item) => `без ${item}`),
  ].filter(Boolean).join(" · ");
}

function capitalize(value: string) {
  return value ? `${value[0].toLocaleUpperCase("ru-RU")}${value.slice(1)}` : "Корзина";
}

function peopleLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11
    ? "человек"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "человека"
      : "человек";
  return `${count} ${noun}`;
}
```

- [ ] **Step 3: Write plain-language variant presentation tests**

In `variantPresentation.test.ts`, replace shorthand expectations with:

```ts
expect(getVariantPresentation(cheaper, variants).priceDeltaLabel).toBe("На 131 ₽ дешевле");
expect(getVariantPresentation(costlier, variants).priceDeltaLabel).toBe("На 230 ₽ дороже");
expect(getVariantPresentation(equal, variants).priceDeltaLabel).toBe("Цена как у сбалансированной");
expect(getVariantPresentation(cheaper, variants).itemCountLabel).toBe("7 товаров");
expect(getVariantPresentation(cheaper, variants).priceDeltaTone).toBe("positive");
```

Keep the safe `Альтернатива` fallback test when budget is not cheaper.

- [ ] **Step 4: Simplify `VariantPresentation`**

Use:

```ts
export interface VariantPresentation {
  title: string;
  subtitle: string;
  priceDeltaLabel: string;
  priceDeltaTone: "positive" | "warning" | "neutral";
  tradeoffText: string;
  cookingLabel: string;
  itemCountLabel: string;
  previewItems: string[];
}
```

Remove `recommendationLabel` and `coverageLabel`.

Compute delta copy with:

```ts
const priceDeltaLabel =
  delta < 0 ? `На ${formatRub(Math.abs(delta))} ₽ дешевле`
  : delta > 0 ? `На ${formatRub(delta)} ₽ дороже`
  : "Цена как у сбалансированной";
```

Set the tone with:

```ts
const priceDeltaTone =
  delta < 0 ? "positive"
  : delta > 0 ? "warning"
  : "neutral";
```

Use `7 товаров`, not `черновик: 7 позиций`.

- [ ] **Step 5: Add intent-based recommendation helper**

Export from `variantPresentation.ts`:

```ts
export function recommendedStrategy(
  intent: BasketIntent,
  variants: BasketVariant[],
): BasketPriority | null {
  const desired = variants.find((variant) => variant.strategy === intent.priority);
  if (!desired) return null;
  const presentation = getVariantPresentation(desired, variants);
  return presentation.title === "Альтернатива" ? null : desired.strategy;
}
```

- [ ] **Step 6: Create `ResultsHeader`**

Render:

```tsx
<header className="results-header">
  <button type="button" onClick={onStartNewSearch}>Новый запрос</button>
  <p className="section-kicker">Подборка готова</p>
  <h1>3 варианта корзины</h1>
  <div className="results-request-summary">
    <strong>{summarizeIntentTitle(intent)}</strong>
    <span>{summarizeIntentLine(intent)}</span>
  </div>
  <button type="button" onClick={onEditRequest}>Изменить запрос</button>
</header>
```

`Изменить запрос` must not clear current results.

- [ ] **Step 7: Create the simplified `BasketVariantCard`**

The component receives:

```ts
type BasketVariantCardProps = {
  variant: BasketVariant;
  variants: BasketVariant[];
  recommended: boolean;
  onSelect: () => void;
};
```

Render this hierarchy:

```tsx
<article className="basket-variant-card">
  <button type="button" onClick={onSelect}>
    <header>
      <div>
        <h2>{presentation.title}</h2>
        <p>{presentation.subtitle}</p>
      </div>
      {recommended && <span className="recommend-badge">Рекомендуем</span>}
    </header>

    <strong className="basket-variant-card__price">{formattedPrice}</strong>

    <p className={`basket-variant-card__comparison is-${presentation.priceDeltaTone}`}>
      {presentation.priceDeltaLabel} · {presentation.itemCountLabel} · {presentation.cookingLabel}
    </p>

    <ul>
      {presentation.previewItems.map((name) => <li key={name}>{name}</li>)}
    </ul>

    <p>{presentation.tradeoffText}</p>
    <span className="basket-variant-card__action">Посмотреть состав</span>
  </button>
</article>
```

Do not wrap every metric in a pill.

- [ ] **Step 8: Integrate header, retailer selector, and cards into `BasketResults`**

Replace local `groupBasketVariants` and hardcoded retailer order with `buildRetailerOptions`.

Calculate:

```ts
const recommendation = planner.state.intent
  ? recommendedStrategy(planner.state.intent, activeVariants)
  : null;
```

Pass `recommended={variant.strategy === recommendation}`.

Render only `RetailerSelector` options returned by Task 5.

- [ ] **Step 9: Write component tests**

In `results.test.tsx`, verify:

- heading `3 варианта корзины`;
- resolved request title and line;
- `Изменить запрос` calls its handler;
- budget priority recommends `Экономная`;
- speed priority recommends `Быстрая`;
- balanced priority recommends `Сбалансированная`;
- fallback `Альтернатива` has no recommendation;
- CTA says `Посмотреть состав`;
- no text matching `/черновик:/`;
- no text matching `/\+\d+ ₽ к балансу/`.

- [ ] **Step 10: Run results presentation tests**

```bash
pnpm test -- src/services/requestCopy.test.ts src/services/variantPresentation.test.ts src/components/results/results.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit results hierarchy**

```bash
git add src/services/requestCopy* src/services/variantPresentation* src/components/results src/components.tsx
git commit -m "feat: clarify basket comparison results"
```

---

### Task 7: Add conversational follow-up without destroying valid results

**Files:**
- Create: `src/components/results/FollowUpComposer.tsx`
- Modify: `src/components/results/results.test.tsx`
- Modify: `src/components/results/results.css`
- Modify: `src/components.tsx`
- Modify: `src/hooks/useBasketPlanner.profile.test.ts`

**Interfaces:**
- Produces: `FollowUpComposer({ intent, busy, error, onSubmit, inputRef })`.
- Quick actions insert editable text and focus the textarea; they never submit.
- `ResultsHeader.onEditRequest` fills the current `intent.originalRequest` and focuses the follow-up textarea.
- Consumes atomic planner behavior from Task 3.

- [ ] **Step 1: Write quick-action behavior tests**

In `results.test.tsx`, render `FollowUpComposer` and assert:

```ts
fireEvent.click(screen.getByRole("button", { name: "Дешевле" }));
expect(screen.getByLabelText("Что изменить?")).toHaveValue("сделай дешевле");
expect(onSubmit).not.toHaveBeenCalled();

fireEvent.click(screen.getByRole("button", { name: "На больше людей" }));
expect(screen.getByLabelText("Что изменить?")).toHaveValue(expect.stringContaining("3 человека"));
expect(onSubmit).not.toHaveBeenCalled();
```

Use an intent with `people: 2`.

- [ ] **Step 2: Write follow-up submit and error tests**

Assert:

```ts
fireEvent.change(screen.getByLabelText("Что изменить?"), {
  target: { value: "убери рыбу" },
});
fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));
expect(onSubmit).toHaveBeenCalledWith("убери рыбу");
```

Render an error and verify the previous card remains visible next to the error notice.

- [ ] **Step 3: Implement `FollowUpComposer`**

Use internal text state and these quick fragments:

```ts
const actions = [
  { label: "Дешевле", value: "сделай дешевле" },
  { label: "Меньше готовки", value: "сделай с меньшим количеством готовки" },
  { label: "Убрать продукт", value: "убери " },
  { label: "На больше людей", value: `на ${intent.people + 1} ${peopleWord(intent.people + 1)}` },
];
```

Public methods are controlled through props:

```ts
type FollowUpComposerProps = {
  intent: BasketIntent;
  busy: boolean;
  error: AppError | null;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  inputRef: RefObject<HTMLTextAreaElement>;
};
```

On quick action:

- replace an empty field;
- append with `, ` to a non-empty field;
- focus the textarea;
- do not submit.

Support button submit and `Ctrl/Cmd+Enter`.

- [ ] **Step 4: Integrate follow-up state into `BasketResults`**

Add:

```ts
const [followUp, setFollowUp] = useState("");
const followUpRef = useRef<HTMLTextAreaElement>(null);
```

`ResultsHeader.onEditRequest`:

```ts
setFollowUp(planner.state.intent?.originalRequest ?? "");
requestAnimationFrame(() => followUpRef.current?.focus());
```

Submit:

```ts
const submitFollowUp = async (message: string) => {
  await planner.submit(message);
  setFollowUp("");
};
```

Do not call `reset()` before follow-up.

- [ ] **Step 5: Keep active retailer when it still exists**

After successful new results:

```ts
useEffect(() => {
  if (retailerOptions.some((option) => option.key === activeRetailer)) return;
  setActiveRetailer(retailerOptions[0]?.key ?? "demo");
}, [activeRetailer, retailerOptions]);
```

Do not switch retailer merely because prices changed.

- [ ] **Step 6: Render recoverable errors inside results**

When `planner.state.variants.length > 0` and `planner.state.error` exists, render `ErrorNotice` above `FollowUpComposer`.

The retry button calls `planner.retry`. Existing cards remain in the DOM.

- [ ] **Step 7: Run follow-up tests**

```bash
pnpm test -- src/components/results/results.test.tsx src/hooks/useBasketPlanner.profile.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit conversational follow-up**

```bash
git add src/components/results/FollowUpComposer.tsx src/components/results/results.* src/components.tsx src/hooks/useBasketPlanner.profile.test.ts
git commit -m "feat: add conversational basket follow-up"
```

---

### Task 8: Make selected-basket checkout honest and handle an empty basket

**Files:**
- Modify: `src/config/retailers.ts`
- Modify: `src/components.tsx`
- Modify: `src/components.profile.test.tsx`
- Modify: `src/hooks/useBasketPlanner.ts`
- Modify: `src/hooks/useBasketPlanner.profile.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: retailer capability from Task 5.
- Changes: manual-list checkout returns `{ items }` without a fabricated URL.
- Guarantees: zero-item basket renders an empty state and cannot checkout.

- [ ] **Step 1: Write empty-basket component tests**

In `components.profile.test.tsx` or a new selected-basket describe block:

```ts
renderSelectedBasket({ items: [], totalRub: 0, uniqueItemsCount: 0 });

expect(screen.getByRole("heading", { name: "В корзине больше нет товаров" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Вернуть последний товар" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /корзин/i })).toBeDisabled();
```

Use a previously removed item fixture so Undo can be tested.

- [ ] **Step 2: Write honest capability copy tests**

For VkusVill:

```ts
expect(screen.getByText("Автокорзина")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Открыть корзину во ВкусВилле" })).toBeInTheDocument();
```

For Lenta:

```ts
expect(screen.getByText("Список")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Проверить и скопировать список Ленты" })).toBeInTheDocument();
```

- [ ] **Step 3: Move retailer context to the basket header**

Replace the `Checkout` kicker with `Ваша корзина`.

Display once:

```text
Лента · Список
ТК1453, Овчинниковская наб., 22/24с1
```

Remove the repeated `Лента · storeName, storeAddress` line from each product row unless item retailers/stores differ within one basket.

- [ ] **Step 4: Add the empty selected-basket state**

When `variant.items.length === 0`, render:

```tsx
<div className="selected-basket-empty">
  <PixelBasketMark size={84} state="empty" />
  <h2>В корзине больше нет товаров</h2>
  <button type="button" onClick={undoRemove} disabled={!removed}>
    Вернуть последний товар
  </button>
  <button type="button" onClick={onBackToVariants}>
    К вариантам
  </button>
</div>
```

Move the back callback into `SelectedBasketActions` or expose it through a prop. Do not render item rows in this state.

- [ ] **Step 5: Disable checkout at zero items**

Add `disabled={itemCount === 0 || creating}` to the checkout action.

Do not call `onCreateCart` when `itemCount === 0`.

- [ ] **Step 6: Replace retailer-specific checkout branching**

Use:

```ts
const retailerConfig = RETAILERS[retailer ?? "demo"];
const isManualList = retailerConfig.capability === "manual-list";
```

For `manual-list` in `useBasketPlanner.createCart`:

- validate items when the current retailer supports the existing validation path;
- update changed product data when validation succeeds;
- if the retailer has no validation path, keep the current catalog-backed items;
- return `{ items }`;
- do not return a fabricated retailer basket URL.

For `auto-cart`:

- call `catalog.createCartLink`;
- return `{ url }`.

- [ ] **Step 7: Update checkout UI behavior**

For manual list:

1. call `onCreateCart`;
2. copy the returned items or current items;
3. show `Список проверен и скопирован`;
4. keep the user in the app;
5. do not render an external-open link.

For auto-cart:

1. call `onCreateCart`;
2. when `url` exists, render `Открыть корзину во ВкусВилле`;
3. open in a new tab only after the explicit user click.

- [ ] **Step 8: Simplify item rows**

Keep:

- thumbnail;
- name;
- weight/pack;
- `Цена проверена в 14:35`;
- price;
- quantity;
- replace;
- delete.

Remove repeated store address from every row.

Use `hyphens: none` for product names and let controls wrap below the copy at 320px.

- [ ] **Step 9: Add freshness disclaimer**

Before the fixed checkout bar, render:

```text
Цены, наличие и состав могут измениться. Проверьте товары перед оформлением.
```

Use secondary 12–13px text, not a warning banner.

- [ ] **Step 10: Run basket tests**

```bash
pnpm test -- src/components.profile.test.tsx src/hooks/useBasketPlanner.profile.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit selected-basket fixes**

```bash
git add src/config/retailers.ts src/components.tsx src/components.profile.test.tsx src/hooks/useBasketPlanner.ts src/hooks/useBasketPlanner.profile.test.ts src/styles.css
git commit -m "feat: clarify retailer checkout behavior"
```

---

### Task 9: Fix profile geolocation, focus, duplicate copy, and narrow-screen auth

**Files:**
- Modify: `src/components.tsx`
- Modify: `src/components.profile.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `reverseGeocodeAddress(lat, lon)` from `src/services/catalog.ts`.
- Keeps: existing profile persistence, address suggestions, Lenta store selection, and auth provider.
- Guarantees: opening Profile does not force the address keyboard.

- [ ] **Step 1: Write geolocation resolution test**

Mock `navigator.geolocation.getCurrentPosition` and `reverseGeocodeAddress`.

Assert:

```ts
fireEvent.click(screen.getByRole("button", { name: "Определить автоматически" }));

await waitFor(() => expect(reverseGeocodeAddress).toHaveBeenCalledWith(55.75, 37.61));
expect(screen.getByLabelText("Адрес")).toHaveValue("г Москва, ул Тверская, д 1");
```

- [ ] **Step 2: Write focus and heading tests**

After opening profile:

```ts
expect(screen.getAllByRole("heading", { name: "Профиль" })).toHaveLength(1);
expect(screen.getByLabelText("Адрес")).not.toHaveFocus();
```

- [ ] **Step 3: Reuse reverse geocoding in `ProfileControl`**

Import `reverseGeocodeAddress`.

Replace the success-only callback with:

```ts
({ coords }) => {
  void reverseGeocodeAddress(coords.latitude, coords.longitude)
    .then((addresses) => {
      const address = addresses[0];
      if (!address) {
        setGeoStatus("unavailable");
        return;
      }
      selectAddress(address);
      setGeoStatus("success");
    })
    .catch(() => setGeoStatus("unavailable"));
}
```

Do not claim success until an address has been inserted.

- [ ] **Step 4: Remove forced address autofocus**

Remove `autoFocus` from `#profile-address`.

On dialog open, focus `#profile-title` with `tabIndex={-1}` or focus the close button. Keep focus restoration to the profile trigger.

- [ ] **Step 5: Remove the duplicate heading**

Use one heading:

```tsx
<h2 id="profile-title" tabIndex={-1}>Профиль</h2>
<p className="profile-dialog-copy">Настройки для следующих подборок.</p>
```

Remove the duplicate `section-kicker` text `Профиль`.

- [ ] **Step 6: Stack email auth controls at 420px**

Add:

```css
@media (max-width: 420px) {
  .profile-inline-action {
    grid-template-columns: 1fr;
  }

  .profile-inline-action .secondary-button {
    width: 100%;
  }
}
```

Ensure the field and button remain at least 44px high.

- [ ] **Step 7: Run profile tests**

```bash
pnpm test -- src/components.profile.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit profile fixes**

```bash
git add src/components.tsx src/components.profile.test.tsx src/styles.css
git commit -m "fix: complete mobile profile interactions"
```

---

### Task 10: Use pixel art consistently in onboarding, empty, and success states

**Files:**
- Modify: `src/components/onboarding/OnboardingFlow.tsx`
- Modify: `src/components/loader/FullscreenLoader.tsx`
- Modify: `src/components/loader/FullscreenLoader.test.tsx`
- Modify: `src/components.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `PixelBasketMark` from Task 1.
- Keeps: existing falling-food and pixel-basket loader.
- Adds: lightweight success/empty presentation without loading the large sprite atlas outside the loader.

- [ ] **Step 1: Add pixel identity assertions**

Tests must verify:

```ts
expect(screen.getByTestId("pixel-basket-mark")).toBeInTheDocument();
```

Add `data-testid="pixel-basket-mark"` to the lightweight mark.

Cover:

- first-run value screen;
- empty results;
- empty selected basket;
- loader finishing state.

- [ ] **Step 2: Keep the animated loader and add branded finishing copy**

In `FullscreenLoader`, when `finishing` is true:

```tsx
<div className="loader-success" role="status">
  <PixelBasketMark size={72} state="success" decorative={false} />
  <strong>Корзины готовы</strong>
</div>
```

Keep the existing food-rain/pixel basket animation during analysis, search, and composition. Do not replace it with the lightweight icon.

- [ ] **Step 3: Use the mark in empty results**

Replace the generic Lucide shopping-basket icon in `EmptyResultsState` with:

```tsx
<PixelBasketMark size={84} state="empty" />
```

Keep the practical copy and action.

- [ ] **Step 4: Verify reduced motion**

In the loader test, emulate reduced motion and assert the finishing state still renders meaningful text even when animation duration is effectively zero.

CSS:

```css
@media (prefers-reduced-motion: reduce) {
  .pixel-basket-mark--success {
    animation: none;
  }
}
```

- [ ] **Step 5: Verify the heavy sprites are not used by static marks**

Search imports:

```bash
rg "basket-layers|food-sprites" src/components/brand src/components/onboarding src/components.tsx
```

Expected: no matches. Heavy sprites remain confined to `src/components/loader`.

- [ ] **Step 6: Run pixel-state tests**

```bash
pnpm test -- src/components/loader/FullscreenLoader.test.tsx src/components/onboarding/OnboardingFlow.test.tsx src/App.test.tsx src/components.profile.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the brand-state integration**

```bash
git add src/components/brand src/components/onboarding/OnboardingFlow.tsx src/components/loader src/components.tsx src/App.test.tsx src/components.profile.test.tsx src/styles.css
git commit -m "feat: extend pixel basket identity across states"
```

---

### Task 11: Align product documentation and remove obsolete identity/chrome

**Files:**
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: `README.md`
- Modify: `src/components.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- No runtime interfaces.
- Documents the implemented product and removes obsolete marketplace and VkusVill-app claims.

- [ ] **Step 1: Update product positioning**

In `PRODUCT.md`, state:

- product name `Умная корзина`;
- neutral multi-retailer basket aggregator;
- focused task-led utility;
- retailers are sources;
- address requested after a real request;
- pixel art is part of brand;
- analytics backend is not part of this milestone.

Remove positioning that calls the whole app a VkusVill service.

- [ ] **Step 2: Reconcile the design north star**

In `DESIGN.md`, replace `Grab Food meets Groceria` marketplace framing with:

```text
A focused mobile AI utility for turning a grocery task into comparable real baskets.
```

Keep the useful palette, compact cards, and black final action, but remove required marketplace search, category departments, promo hero, favourites, and five-item bottom navigation.

- [ ] **Step 3: Update README flow**

Document:

```text
task -> delivery context if missing -> retailer comparison -> three strategies -> follow-up -> basket edit -> auto cart or validated list
```

Add the independent-service note.

- [ ] **Step 4: Remove obsolete visible copy and dead CSS**

Run:

```bash
rg -n "ВкусВилл Advisor|AI-планировщик корзины|Что купить сегодня|Любимое|bottom-nav|hero-offer|category-shortcuts" index.html src PRODUCT.md DESIGN.md README.md
```

Expected after cleanup:

- retailer-specific `ВкусВилл` references remain where they describe a source or checkout;
- no `ВкусВилл Advisor`;
- no `AI-планировщик корзины`;
- no fake marketplace navigation rules/components.

- [ ] **Step 5: Run lint and targeted tests**

```bash
pnpm lint
pnpm test -- src/App.test.tsx src/components.profile.test.tsx src/components/results/results.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit documentation and cleanup**

```bash
git add PRODUCT.md DESIGN.md README.md src/components.tsx src/styles.css
git commit -m "docs: align product with focused basket utility"
```

---

### Task 12: Complete automated, accessibility, and responsive verification

**Files:**
- Modify only if verification exposes a defect: the smallest relevant source and test file.
- Add screenshots locally under `tmp/focused-utility-review/`; do not commit them unless requested.

**Interfaces:**
- No new interfaces.
- Confirms the whole spec and acceptance criteria.

- [ ] **Step 1: Run the complete unit test suite**

```bash
pnpm test
```

Expected: all Vitest suites PASS.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: zero ESLint errors.

- [ ] **Step 3: Run the production build**

```bash
pnpm build
```

Expected: TypeScript build and Vite production bundle complete successfully.

- [ ] **Step 4: Start the application**

```bash
pnpm dev
```

Wait until both Vite and the API report ready.

- [ ] **Step 5: Verify first run at 320×568**

```bash
mkdir -p tmp/focused-utility-review
agent-browser --session focused open http://localhost:5173
agent-browser --session focused set viewport 320 568
agent-browser --session focused wait --load networkidle
agent-browser --session focused screenshot tmp/focused-utility-review/01-first-run-320.png
agent-browser --session focused snapshot -i
```

Confirm:

- only the optional value screen appears;
- pixel basket is visible;
- no progress `Шаг 1 из 3`;
- close and `Попробовать` have 44px targets;
- no horizontal overflow.

- [ ] **Step 6: Verify home and deferred delivery at 390×844**

Dismiss the intro, set viewport, enter a real request, and submit:

```bash
agent-browser --session focused set viewport 390 844
agent-browser --session focused find role button click --name "Попробовать"
agent-browser --session focused find label "Что собрать?" fill "Ужины на 3 дня для двоих до 3000 ₽, без грибов"
agent-browser --session focused find role button click --name "Продолжить"
agent-browser --session focused screenshot tmp/focused-utility-review/02-delivery-390.png
```

Confirm:

- home has no fake search or bottom navigation;
- request survives into delivery setup;
- address screen has one primary continuation action.

- [ ] **Step 7: Verify results and follow-up**

Use a working local catalog or the existing debug/mock route. Capture:

```bash
agent-browser --session focused screenshot tmp/focused-utility-review/03-results-390.png
agent-browser --session focused snapshot -i
```

Confirm:

- `3 варианта корзины`;
- resolved request summary;
- only non-empty retailer options;
- retailer capability visible;
- recommendation matches the current intent;
- plain `дороже/дешевле` copy;
- `Посмотреть состав`;
- follow-up and four quick actions.

- [ ] **Step 8: Verify selected basket**

Open a variant and capture:

```bash
agent-browser --session focused find role button click --name "Посмотреть состав"
agent-browser --session focused screenshot tmp/focused-utility-review/04-basket-390.png
```

Confirm:

- `Ваша корзина`, retailer, and capability appear once;
- controls wrap without overlapping;
- checkout does not obscure the last item;
- manual-list and auto-cart wording are distinct;
- deleting all items produces the empty state and disables checkout.

- [ ] **Step 9: Perform keyboard-only checks**

Using fresh DOM snapshots after each navigation:

- Tab through first-run close and CTA;
- navigate address suggestions with ArrowDown/ArrowUp/Enter;
- Escape closes dialogs and restores focus;
- Tab through retailer selector and strategy cards;
- `Ctrl+Enter` or `Cmd+Enter` submits follow-up;
- Profile opens without focusing the address field;
- all focus rings remain visible.

- [ ] **Step 10: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce` in the browser session or devtools and confirm:

- food rain is hidden;
- success and empty copy still appears;
- no workflow becomes dependent on animation.

- [ ] **Step 11: Verify neutral naming**

Run:

```bash
rg -n "ВкусВилл Advisor|AI-планировщик корзины" index.html src public PRODUCT.md DESIGN.md README.md
```

Expected: no matches.

Run:

```bash
rg -n "ВкусВилл|Лента|Пятёрочка" src
```

Expected: matches exist only in retailer labels, retailer-specific catalog/checkout copy, and tests.

- [ ] **Step 12: Review the final diff**

```bash
git status --short
git diff --stat main...HEAD
git log --oneline --decorate main..HEAD
```

Confirm:

- no analytics backend or analytics dependency was added;
- no new retailer adapter was added;
- no unrelated refactor is present;
- every task has a focused commit.

- [ ] **Step 13: Push and update the existing draft PR**

```bash
git push -u origin codex/focused-ai-utility-redesign
```

Update PR #1 description with:

- implementation summary;
- commands and outcomes for test/lint/build;
- screenshots or a preview deployment;
- known external limitations: live OTP, retailer availability, and retailer-owned checkout behavior.

- [ ] **Step 14: Mark implementation ready for review**

Only after all commands pass and screenshots have been inspected, change PR #1 from draft to ready for review.
