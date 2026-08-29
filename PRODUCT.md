# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are VkusVill shoppers who want to assemble a grocery basket quickly from a practical request rather than searching for individual products. They describe meals, budget, household size, preferences, and restrictions, then compare basket scenarios before choosing one.

## Product Purpose

VkusVill Advisor helps users assemble optimal grocery baskets for their stated need. Success means the user can describe a food-shopping task in natural language, receive three useful basket scenarios, understand the tradeoffs, choose a variant, and create or copy a basket for checkout.

## Positioning

The product is positioned as a service for building optimal grocery baskets around the user's request. It is not a generic product search: its mechanism is "describe the task -> get three basket scenarios with tradeoffs -> choose a basket -> create a cart link."

## Operating Context

The product runs as an experimental web app backed by a local or hosted Node API. LLM calls go through NeuralDeep by default; OpenRouter remains as a legacy provider but is not the default path. Product discovery and cart operations use the VkusVill MCP/catalog flow through the server, not directly from the browser.

## Capabilities and Constraints

- The user can submit a natural-language basket request.
- The app extracts intent such as people, days, meals, budget, cooking time, preferences, and excluded ingredients.
- The app searches the VkusVill catalog and composes three basket scenarios: balanced, budget, and speed.
- The app shows tradeoffs, item quantities, prices, and selected-basket controls.
- The app can create a cart link when the live catalog path is available.
- API keys and LLM/MCP credentials must stay server-side and must not be exposed in the browser bundle.
- Prices, availability, images, and product composition must come from catalog data where available.
- The product must not invent unavailable products as if they were real catalog items.

## Brand Commitments

The product name is VkusVill Advisor. The app is an unofficial experimental prototype and should not claim official status unless that changes. The interface copy is Russian-first and should stay practical, concise, and task-oriented.

## Evidence on Hand

- Existing React/Vite application: `src/App.tsx`, `src/components.tsx`, `src/styles.css`.
- Server integration and provider routing: `server.mjs`.
- Catalog and MCP parsing: `src/services/catalog.ts`, `src/services/mcpParsing.ts`, `src/services/retrieveCandidateProducts.ts`.
- Prompt and schema contracts: `src/prompts/intentPrompt.ts`, `src/prompts/basketPrompt.ts`, `src/schemas.ts`.
- Design-system source imported into the project: `design-system/` and `src/styles/vkusvill-advisor.css`.
- No confirmed testimonials, performance claims, commercial pricing, legal status, or official VkusVill endorsement are on hand.

## Product Principles

- Start from the user's task, not from a product list.
- Make tradeoffs explicit so choosing a basket feels informed, not random.
- Prefer real catalog data over polished fiction.
- Keep credentials and provider complexity under the hood.
- Preserve a fast, mobile-first flow that works for repeated grocery decisions.

## Accessibility & Inclusion

No product-specific accessibility standard has been confirmed yet. Future work should preserve baseline web accessibility for keyboard access, readable text, clear focus states, and Russian-language copy that remains understandable on small screens.
