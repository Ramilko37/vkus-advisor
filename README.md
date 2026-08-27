# Корзина под задачу

Неофициальный экспериментальный прототип.

## Запуск

Секреты не попадают в браузерный bundle. NeuralDeep и MCP вызываются только через локальный Node-сервер.
OpenRouter оставлен в коде как legacy-провайдер, но не используется по умолчанию.

Production-режим:

```bash
pnpm install
pnpm build
NEURALDEEP_API_KEY="ваш-ключ" pnpm start
```

После старта откройте:

```text
http://127.0.0.1:5174
```

Можно также создать локальный `.env` рядом с `.env.example`. Файл `.env` игнорируется git.

```env
LLM_PROVIDER=neuraldeep
NEURALDEEP_API_KEY=sk-...
NEURALDEEP_API_BASE_URL=https://api.neuraldeep.ru/v1
NEURALDEEP_INTENT_MODEL=gpt-oss-120b
NEURALDEEP_BASKET_MODEL=gpt-oss-120b
NEURALDEEP_INTENT_MAX_TOKENS=600
NEURALDEEP_BASKET_MAX_TOKENS=1800
VKUSVILL_MCP_URL=https://mcp.vkusvill.ru/mcp
MAX_SEARCH_QUERIES=5
MAX_SEARCH_RESULTS_PER_QUERY=4
MAX_CANDIDATES_FOR_LLM=16
MAX_BASKET_ITEMS_FROM_LLM=12
PORT=5174
```

Не открывайте `index.html` через `file://`: в этом режиме браузер не сможет вызвать `/api/llm` и `/api/catalog/*`.

Если нужно временно вернуть OpenRouter, явно задайте `LLM_PROVIDER=openrouter` и старые `OPENROUTER_*` переменные.

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
