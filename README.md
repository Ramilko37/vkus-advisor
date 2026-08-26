# Корзина под задачу

Неофициальный экспериментальный прототип.

## Запуск

Секреты не попадают в браузерный bundle. OpenRouter и MCP вызываются только через локальный Node-сервер.

Production-режим:

```bash
pnpm install
pnpm build
OPENROUTER_API_KEY="ваш-новый-ключ" pnpm start
```

После старта откройте:

```text
http://127.0.0.1:5174
```

Можно также создать локальный `.env` рядом с `.env.example`. Файл `.env` игнорируется git.

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_API_URL=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_INTENT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
OPENROUTER_BASKET_MODEL=nvidia/nemotron-3-super-120b-a12b:free
OPENROUTER_INTENT_FALLBACK_MODEL=dots-studio/dots-3-note-preview:free
OPENROUTER_BASKET_FALLBACK_MODEL=dots-studio/dots-3-note-preview:free
OPENROUTER_INTENT_MAX_TOKENS=600
OPENROUTER_BASKET_MAX_TOKENS=1800
OPENROUTER_HTTP_REFERER=http://127.0.0.1:5174
OPENROUTER_APP_TITLE=Basket Task Prototype
VKUSVILL_MCP_URL=https://mcp.vkusvill.ru/mcp
MAX_SEARCH_QUERIES=5
MAX_SEARCH_RESULTS_PER_QUERY=4
MAX_CANDIDATES_FOR_LLM=16
MAX_BASKET_ITEMS_FROM_LLM=12
PORT=5174
```

Не открывайте `index.html` через `file://`: в этом режиме браузер не сможет вызвать `/api/openrouter` и `/api/catalog/*`.

Dev-режим:

```bash
pnpm dev
```

Эта команда поднимает и Node API, и Vite. Vite строго использует `http://localhost:5173` и прокидывает `/api/*` в Node-сервер на `PORT` из `.env`. Если `5173` занят старым процессом, остановите его и запустите `pnpm dev` заново.

Если нужно запускать процессы отдельно:

```bash
pnpm dev:api
pnpm dev:web
```
