# FRT-194 Clarification, Generation State, and Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the task-input-to-Compare flow predictable, cancellable, recoverable, and safe against duplicate submissions or refresh dead ends.

**Architecture:** Keep `useBasketPlanner` as the single source of workflow truth and extend its explicit state/actions instead of adding a second state machine. Render clarification on Home and generation as the existing full-screen progress layer; route to `/results` only when state is `ready` with valid variants, and recover invalid direct navigation to Home.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite, browser `history` and `sessionStorage`.

**Spec:** [Linear FRT-194](https://linear.app/fortis-project/issue/FRT-194/05p0festate-peresobrat-clarification-generation-state-i-routing)

## Global Constraints

- Reuse the existing `BasketIntent` merge flow.
- Ask exactly one clarification question per step and preserve previous intent slots.
- Generation copy must include `Подбираем варианты`, `Поняли задачу`, `Нашли товары`, `Собираем варианты`, and `Отменить`.
- A second submit while a workflow is active must not start another request.
- `/results` is entered only after `ready`; invalid direct navigation returns to a recoverable Home state.
- Raw API/HTTP messages never reach the user; every error offers a recovery action.
- No new dependency or speculative abstraction.

---

### Task 1: Central workflow state and request exclusivity

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/hooks/useBasketPlanner.ts`
- Test: `src/hooks/useBasketPlanner.profile.test.ts`

**Interfaces:**
- Consumes: existing `WorkflowStage`, `PlannerState`, `submit`, `cancel`, and `BasketIntent` merge behavior.
- Produces: explicit `canceled` state, active-submit guard, and stable cancellation semantics.

- [ ] **Step 1: Write failing hook tests**

```ts
it("ignores a second submit while generation is active", async () => {
  const first = result.current.submit("ужины на 3 дня для двоих до 3000");
  const second = result.current.submit("другой запрос на неделю");
  expect(generateStructured).toHaveBeenCalledTimes(1);
  await first;
  await second;
});

it("moves an aborted workflow to canceled without surfacing an error", async () => {
  result.current.cancel();
  expect(result.current.state.stage).toBe("canceled");
  expect(result.current.state.error).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/hooks/useBasketPlanner.profile.test.ts`

Expected: duplicate workflow count and `canceled` state assertions fail against current behavior.

- [ ] **Step 3: Implement the minimum state changes**

Add `"canceled"` to `WorkflowStage`, reject `submit` while the current stage is active, and make `cancel()` invalidate and abort the active request before dispatching `canceled`. A new valid submit may start from `canceled`.

- [ ] **Step 4: Run hook tests and verify GREEN**

Run: `pnpm test -- src/hooks/useBasketPlanner.profile.test.ts`

Expected: all hook tests pass.

### Task 2: One-step clarification with quick answers

**Files:**
- Modify: `src/components.tsx`
- Modify: `src/styles.css`
- Test: `src/components.profile.test.tsx`

**Interfaces:**
- Consumes: `planner.state.stage === "clarifying"`, the latest assistant message, `planner.submit(answer)`, and existing intent merge rules.
- Produces: one visible question, contextual quick answers, and a manual follow-up field without a long form.

- [ ] **Step 1: Write failing component tests**

```tsx
it("shows one clarification question and person quick answers", () => {
  renderConversation({ stage: "clarifying", clarificationQuestion: "На сколько человек собрать?" });
  expect(screen.getAllByRole("heading", { name: "На сколько человек собрать?" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
});

it("submits a quick answer once", () => {
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  expect(planner.submit).toHaveBeenCalledOnce();
  expect(planner.submit).toHaveBeenCalledWith("На 2 человека");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/components.profile.test.tsx`

Expected: clarification region and quick-answer buttons are absent.

- [ ] **Step 3: Implement the clarification region**

Render the current `intent.clarificationQuestion` once. Derive only two small answer sets: `1 / 2 / 3 / 4+` for people and budget values plus manual input for budget; all other questions use the normal single textarea. Quick answers call `planner.submit` and rely on existing `applyFastIntentPatch`/model merge to keep previous slots.

- [ ] **Step 4: Run component tests and verify GREEN**

Run: `pnpm test -- src/components.profile.test.tsx`

Expected: all component tests pass.

### Task 3: Generation presentation and ready-only routing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/loader/FullscreenLoader.tsx`
- Modify: `src/components/loader/fullscreen-loader.css`
- Test: `src/App.test.tsx`
- Test: `src/components/loader/FullscreenLoader.test.tsx`

**Interfaces:**
- Consumes: centralized `planner.state.stage`, `planner.state.intent`, `planner.cancel`, and persisted ready variants.
- Produces: progress screen with exact product copy and routing that never uses `/results` as loading state.

- [ ] **Step 1: Write failing routing and loader tests**

```tsx
it("keeps generation on Home until variants are ready", () => {
  renderAppAt("/", plannerAt("searching"));
  expect(window.location.pathname).toBe("/");
  expect(screen.getByRole("heading", { name: "Подбираем варианты" })).toBeInTheDocument();
});

it("shows the three real progress stages", () => {
  render(<FullscreenLoader stage="searching" intent={intent} onCancel={vi.fn()} />);
  expect(screen.getByText("Поняли задачу")).toBeInTheDocument();
  expect(screen.getByText("Нашли товары")).toBeInTheDocument();
  expect(screen.getByText("Собираем варианты")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/App.test.tsx src/components/loader/FullscreenLoader.test.tsx`

Expected: current code routes loading to `/results` and uses old progress copy.

- [ ] **Step 3: Implement ready-only routing and exact progress copy**

Delete the loading redirect effect and loading skeleton route branch. Keep the loader over Home during `analyzing | searching | composing`, summarize intent compactly, and push `/results` only for `ready` with valid variants. When `/results` has no restored variants, replace the URL with `/` and show Home.

- [ ] **Step 4: Run routing and loader tests and verify GREEN**

Run: `pnpm test -- src/App.test.tsx src/components/loader/FullscreenLoader.test.tsx`

Expected: all targeted tests pass.

### Task 4: Stage-aware errors and recovery actions

**Files:**
- Modify: `src/hooks/useBasketPlanner.ts`
- Modify: `src/components.tsx`
- Test: `src/hooks/useBasketPlanner.profile.test.ts`
- Test: `src/components.profile.test.tsx`

**Interfaces:**
- Consumes: failures from intent, catalog lookup, candidate search, and basket composition.
- Produces: safe stage-specific `AppError` copy and `Повторить`, `Изменить запрос`, or `Выбрать другой магазин` recovery.

- [ ] **Step 1: Write failing error-contract tests**

```ts
it("maps a catalog failure to safe recoverable copy", async () => {
  createCatalogClient.mockRejectedValue(new Error("HTTP 503 upstream payload"));
  await result.current.submit("ужины на 3 дня для двоих до 3000");
  expect(result.current.state.error?.message).toBe("Каталог временно недоступен.");
  expect(result.current.state.error?.message).not.toMatch(/HTTP|503|payload/);
});
```

```tsx
it("offers request editing for a generation error", () => {
  renderConversation({ error: { code: "generation", message: "Не удалось собрать варианты." } });
  expect(screen.getByRole("button", { name: "Изменить запрос" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/hooks/useBasketPlanner.profile.test.ts src/components.profile.test.tsx`

Expected: raw error copy leaks and only the generic retry action exists.

- [ ] **Step 3: Implement stage-safe mapping and actions**

Track the failing stage inside the workflow catch and map it to fixed messages: catalog unavailable, insufficient products, generation failure, or retailer unavailable. Keep retry for transient failures, clear the error and focus the task field for `Изменить запрос`, and open the address/store flow for `Выбрать другой магазин`.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `pnpm test -- src/hooks/useBasketPlanner.profile.test.ts src/components.profile.test.tsx`

Expected: all targeted tests pass and no raw upstream text is rendered.

### Task 5: Full verification and review

**Files:**
- Verify all files above.

**Interfaces:**
- Consumes: all completed behavior.
- Produces: a reviewed, merge-ready FRT-194 commit.

- [ ] **Step 1: Run the full suite**

Run: `pnpm test -- --run`

Expected: all tests pass.

- [ ] **Step 2: Run production build and diff checks**

Run: `pnpm build`

Run: `git diff --check`

Expected: both commands succeed.

- [ ] **Step 3: Verify mobile behavior in a real browser**

At 390×844, verify Home clarification and generation states, one visible recovery action, no horizontal overflow, and tappable controls of at least 44px.

- [ ] **Step 4: Commit and request independent review**

```bash
git add docs/superpowers/plans/2026-09-02-frt-194-clarification-generation-routing.md src
git commit -m "feat: rebuild generation flow"
```

Request review against the FRT-194 acceptance criteria and resolve every Blocking/Important finding before merging.
