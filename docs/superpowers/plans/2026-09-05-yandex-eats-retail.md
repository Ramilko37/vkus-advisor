# Yandex Eats Retail implementation

Spec: `/Users/rr/Downloads/YandexEatsRetailAdapter-tech-spec.md`.

Implement in this task using existing Node/TypeScript services and Vitest, without dependencies or cart writes. Existing uncommitted Lavka work must be preserved.

- [x] Add shared retailer registry, provider identity, source selection, and tests (direct threshold 4; one provider/place per retailer).
- [x] Add anonymous location-scoped adapter and synthetic fixture tests: discovery, normalization, sorting, bounded concurrency, retry, cache isolation, status and unsupported recheck.
- [x] Integrate search, validation gate, provider status, schema, retailer grouping, persisted results and read-only handoff. Candidate-only products must not enter final baskets or replace direct sources there.
- [x] Add repeatable discovery/search/recheck/load spike; record actual live evidence separately from synthetic fixtures.
- [x] Run relevant unit/integration tests, full test suite, build and lint. Keep default disabled and reject validated mode until live exact lookup is proven.

Verification: 176 tests passed in 36 files; `pnpm build`, `pnpm lint`, and `git diff --check` passed. Live acceptance and rollout remain blocked by upstream HTTP 403, as recorded in `docs/spikes/2026-09-05-yandex-eats-retail.md`.

Live preflight: anonymous Moscow `/retail` returned HTTP 403 with VPN block page. Continue implementation with `candidates_only` capability; no guessed goods request or production rollout.
