# Yandex Eats Retail: alpha implementation and live spike

Specification: `/Users/rr/Downloads/YandexEatsRetailAdapter-tech-spec.md`.
Referenced [reverse-engineering notes](https://github.com/Mikhail164th/yandex-delivery) read 2026-09-05; not an official API contract.

## Live evidence

An anonymous Moscow request to `/retail?longitude=37.6173&latitude=55.7558` returned HTTP 403 with title «Похоже, вы используете VPN». No store links or SKU fixtures were obtained. No session, browser automation, captcha bypass or cart request was used.

The completed script was then run:

```sh
node scripts/yandex-eats-retail-spike.mjs --lat 55.7558 --lon 37.6173
```

At `2026-09-05T10:13:29.867Z` it reported one HTTP 403, `RetailerAuthError`, `connected: false`, `captchaBlocked: false`, zero stores. Recorded latency: 510 ms. This is a discovery failure latency, **not search p95**. Exit status: 1. No immediate retry.

| Stage | Result |
| --- | --- |
| A: discovery | HTTP 403; location specificity, nearest store, delivery zone, session requirements and link shape remain unproven |
| B: five retailers / eight queries | Not run: no live placeSlug |
| C: ten exact SKU rechecks | Not run: no live SKU or confirmed goods request contract |
| D: 50 searches at concurrency 1 and 3 | Not run: discovery blocked; search latency and 403/429 rates are unknown |

No goods request shape was guessed. Validated mode and preview/production rollout remain blocked. Retest where anonymous access is permitted, obtain location-specific fixtures, and prove exact goods lookup with fresh availability before changing the gate.

## Implemented behavior

- Shared retailer registry, derived `RetailerId`, separate `CatalogProviderId` on direct/demo products, provider/place-scoped Eats identifiers.
- Anonymous discovery parser for `/retail/<slug>` links and `data-place-slug`, based on the spec. Names currently use registry titles; branch names, IDs, distance and ETA need live fixtures. First discovered place per retailer is used; nearest-place selection is not claimed.
- Search, conservative normalization (`availability: unknown`), local price sort, caches scoped to five-decimal coordinate keys, in-flight deduplication, global concurrency ≤3 and fan-out ≤4 retailers per query. Stale results retain price timestamps. In-memory caches are capped at 500 entries each.
- Wave 1 networks enabled. Direct networks enter fallback only below four distinct query candidates. Wave 2 stays disabled. Selection over the complete candidate pool chooses one provider/place per retailer; direct source wins at four distinct candidates.
- `/api/catalog/search` keeps direct/demo `products`; normalized alpha results use `candidateProducts` with effective `yandexEats` status. This prevents alpha search from displacing direct catalogs. The client passes both to common selection, which excludes Eats before final composition. Reused candidates and replacements are guarded too.
- Retailer schemas and UI labels share the registry. LLM schema uses the actual composable retailer set and three strategies each; static schema limit is 30 variants, identifiers up to 400 characters.
- `verifyItems` throws `ProductRecheckUnsupportedError`; details/validation routes return 409. There is no goods cache or successful recheck until a real read-only contract exists. Setting `mode=validated` cannot bypass this gate: effective mode is `candidates_only`.
- Health reports effective mode, connection/captcha status and retailer count. Metrics record request status, latency, result counts, error classes and per-retailer aggregates. Blocked upstream requests do not immediately retry; transient errors retry once.
- Store handoff says «Открыть магазин в Яндекс Еде» and claims neither validation nor cart transfer. Cart route rejects Eats identifiers before reaching other providers. Default configuration remains disabled.

Synthetic tests cover these behaviors; they are **not live fixtures or proof of API availability**. Live spike and validated-provider acceptance remain incomplete.

## Repeatable commands

```sh
# Existing DaData integration; needs DADATA_API_KEY in the app environment.
node scripts/yandex-eats-retail-spike.mjs --address "Москва, Тверская 1"

# After successful discovery: 50 uncached searches at each concurrency.
# Stops on 403/429 instead of repeatedly retrying a block.
node scripts/yandex-eats-retail-spike.mjs --lat 55.7558 --lon 37.6173 --load

pnpm test
pnpm build
pnpm lint
```

Production promotion requires implementing/testing the proven exact lookup and changing server and final-basket gates. Revise discovery/search normalization if live fixtures differ from the spec. No new dependencies were added; existing uncommitted Lavka work was preserved.
