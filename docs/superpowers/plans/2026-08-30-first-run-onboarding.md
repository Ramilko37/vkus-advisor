# First-run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete four-step first-run activation flow from the approved feature spec, including persistence/resume, shared profile data, first-request handoff, contextual result hints, analytics events, existing-user migration, and retailer-aware Composer gating.

**Architecture:** Keep `UserProfile` and `useBasketPlanner` as the single sources of truth. Add one small localStorage-backed onboarding state hook, a focused onboarding component that reuses existing catalog/profile primitives, and optional onboarding callbacks on existing Composer/results components. Retailer prerequisites become per-retailer availability, not global submission gates.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite, existing CSS tokens and Lucide icons. No new dependencies.

**Spec:** `/Users/rr/.codex/attachments/fa094cf5-7010-4c65-9576-1c9394991765/pasted-text.txt`

## Global Constraints

- Russian-first copy from the approved spec.
- Mobile-first, sticky 48px CTA, minimum 44px touch targets, existing white/pale-green/grocery-green visual system.
- Guest flow must reach the first basket without authentication.
- A valid address and the automatically resolved nearest `lentaStoreId` are required before onboarding can continue.
- Profile remains the single source for address, household size, excluded ingredients, and preferences.
- Request-specific budget, days, meals, and cooking time never become profile fields.
- First request completion launches the existing planner; no separate completion screen.
- Existing users with an address or saved results do not receive mandatory first-run onboarding.
- No new dependencies or speculative backend synchronization.

---

### Task 1: Onboarding persistence and analytics primitives

**Files:**
- Create: `src/services/onboardingRepository.ts`
- Create: `src/services/onboardingRepository.test.ts`
- Create: `src/hooks/useOnboarding.ts`
- Create: `src/hooks/useOnboarding.test.ts`
- Create: `src/services/productAnalytics.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**
- Produces: `OnboardingState`, `OnboardingStep`, `loadOnboardingState()`, `saveOnboardingState()`, `useOnboarding({ activated, ready })`, and `trackProductEvent(name, data?)`.
- `OnboardingState` contains `version`, `status`, `step`, `requestDraft`, optional `completedAt`, and the two result-hint flags.

- [ ] Write failing repository tests proving malformed storage falls back safely, state resumes at the saved step, and activated existing users initialize as completed.
- [ ] Run `rtk pnpm test -- src/services/onboardingRepository.test.ts` and confirm failures are caused by missing exports.
- [ ] Implement JSON/localStorage persistence under `vkusvill-advisor:onboarding:v1` with version `1` and no migration abstraction.
- [ ] Run the repository tests and confirm they pass.
- [ ] Write failing hook tests for start, back, dismiss, profile skip, request draft persistence, completion timestamp, and one-time result hints.
- [ ] Run `rtk pnpm test -- src/hooks/useOnboarding.test.ts` and confirm expected failures.
- [ ] Implement `useOnboarding` as a small state wrapper over the repository; every state transition persists immediately.
- [ ] Add `trackProductEvent` using `console.info("product_analytics", payload)` with persisted anonymous/session identifiers, onboarding version, timestamp, step, and optional retailer.
- [ ] Run both test files and keep them green.

### Task 2: Remove the global Lenta gate

**Files:**
- Modify: `src/components.profile.test.tsx`
- Modify: `src/hooks/useBasketPlanner.profile.test.ts`
- Modify: `src/services/basketOrchestrator.test.ts`
- Modify: `src/components.tsx`
- Modify: `src/hooks/useBasketPlanner.ts`
- Modify: `src/services/basketOrchestrator.ts`

**Interfaces:**
- `ChatComposer` accepts `onNeedsDelivery?: (request: string) => void` and never requires `hasLentaStore`.
- `useBasketPlanner.submit` and `retry` require address but not `lentaStoreId`.
- `composeBaskets` composes every retailer with at least four selected candidates and reports unavailable retailers through existing `RetailerResult` records.

- [ ] Change the Composer test to require an enabled `Продолжить` action after text entry without an address, preserving the request through `onNeedsDelivery`.
- [ ] Add a Composer test proving address plus no Lenta store calls planner submit with CTA `Собрать 3 корзины`.
- [ ] Run the focused component tests and confirm the old behavior fails the new assertions.
- [ ] Replace the planner test that expects `missing_lenta_store` with one proving the workflow starts without it; verify failure.
- [ ] Replace the orchestrator Lenta-shortfall test with one proving VkusVill baskets remain ready while Lenta reports `no_candidates`; verify failure.
- [ ] Implement the smallest shared fix: remove `hasLentaStore` from Composer/ConversationPanel, remove both planner guards, and remove the Lenta-specific orchestrator throw.
- [ ] Relax ProfileControl save so an address can be saved without a Lenta store; preserve a chosen store when present.
- [ ] Run all three focused test files and confirm green.

### Task 3: Build the four onboarding steps with the existing profile model

**Files:**
- Create: `src/components/onboarding/OnboardingFlow.tsx`
- Create: `src/components/onboarding/OnboardingFlow.test.tsx`
- Modify: `src/components.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `OnboardingFlow` consumes `{ onboarding, profile, onProfileChange, onSubmitRequest }`.
- It emits profile updates through the existing `updateProfile()` callback and requests through the existing planner `submit()` callback.
- Export `peopleLabel` and reuse the existing `ChatComposer`; reuse `findLentaStores`, `normalizeProfile`, and `UserProfile` rather than creating parallel domain models.

- [ ] Write a failing integration test that walks `value → delivery → profile → request`, verifies Back preserves state, and verifies auth is absent.
- [ ] Add failing delivery tests for automatic store search, automatic selection when one store is returned, inline empty/error states, and manual address fallback.
- [ ] Add failing profile tests for household range, optional strict exclusions, optional preferences, skip defaults, and explanatory Profile-vs-Request copy.
- [ ] Add a failing request-step test proving profile defaults are summarized and the first request calls the supplied submit callback.
- [ ] Run the onboarding component test and confirm failures are feature-related.
- [ ] Implement the four steps using one draft `UserProfile`, the approved Russian copy, a progress indicator, Back, first-step dismiss, scrollable content, and sticky CTA.
- [ ] Use debounced automatic store lookup after a valid address; always select the nearest result and never continue without a resolved Lenta store.
- [ ] Reuse `ChatComposer` for the request step and persist every request edit through onboarding state.
- [ ] Add mobile-first CSS using existing tokens, 44px targets, safe-area padding, 320px support, and the existing 720px enhancement breakpoint.
- [ ] Run the onboarding tests and confirm green.

### Task 4: Integrate onboarding and Composer continuation into App

**Files:**
- Create: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components.tsx`

**Interfaces:**
- `ConversationPanel` consumes controlled optional `draft`/`onDraftChange` and `onNeedsDelivery` so typed text survives opening onboarding.
- `App` owns the home request draft and passes it into onboarding when delivery setup is required.

- [ ] Write failing App tests for new-user first launch, existing-user bypass, dismiss-to-home, resume from saved step, and Composer `Продолжить → delivery → request restored`.
- [ ] Run `rtk pnpm test -- src/App.test.tsx` and confirm expected failures.
- [ ] Wire `useOnboarding` after auth/profile/planner initialization and suppress first-run rendering while auth state is loading.
- [ ] Render `OnboardingFlow` for `not_started`/`in_progress`; let `dismissed` users use Home and reopen at delivery from Composer.
- [ ] On onboarding request submission, mark onboarding completed, track submission, then call the existing planner so its loading/results routing remains unchanged.
- [ ] Run the App and existing profile/planner tests and confirm green.

### Task 5: Add first-results and basket-edit contextual hints

**Files:**
- Modify: `src/components.tsx`
- Modify: `src/components.profile.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `BasketResults` accepts optional `{ firstRunHints, onDismissResultsHint, onVariantOpened, onBasketEdited, onCheckout }` callbacks.
- Hint visibility is persisted by `useOnboarding`; callbacks also emit the matching analytics events.

- [ ] Write failing tests for the dismissible results hint, one-time basket editing hint after first open, and event callbacks for open/edit/checkout.
- [ ] Run the focused tests and verify failure.
- [ ] Add the compact result hint above variants and the editing hint above item controls without popup/carousel behavior.
- [ ] Dismiss each hint permanently through onboarding state and fire `first_baskets_ready`, `first_variant_opened`, `first_basket_edited`, and `first_checkout_clicked` once.
- [ ] Style hints as quiet existing-product surfaces with no new visual language.
- [ ] Run focused tests and confirm green.

### Task 6: Full verification and responsive inspection

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- No new interfaces.

- [ ] Run `rtk pnpm test`.
- [ ] Run `rtk pnpm lint`.
- [ ] Run `rtk pnpm build`.
- [ ] Start the existing dev server and inspect onboarding at 320×568, 390×844, 768×900, and desktop width.
- [ ] Verify keyboard flow, Escape/Back behavior, focus visibility, no horizontal overflow, sticky CTA, refresh resume, existing-user bypass, and reduced-motion behavior.
- [ ] Run the Impeccable detector once on the changed TSX/CSS target and address material findings.
- [ ] Re-run tests, lint, and build after any visual fixes.
