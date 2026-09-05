# Корзина под задачу

Неофициальный экспериментальный прототип.

Яндекс Еда Retail: при `YANDEX_EATS_RETAIL_ENABLED=true` и `YANDEX_EATS_RETAIL_MODE=candidates_only` приложение показывает предварительные подборки по магазинам. Цены и наличие не перепроверены; кнопка открывает магазин без переноса корзины. Если каталог недоступен, на экране результатов появляется сообщение. Режим `validated` пока недоступен. [Результат live spike и команды повторной проверки](docs/spikes/2026-09-05-yandex-eats-retail.md).

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
NEURALDEEP_INTENT_MODEL=qwen3.6-fp8-noreason
NEURALDEEP_BASKET_MODEL=qwen3.6-fp8-noreason
NEURALDEEP_INTENT_MAX_TOKENS=600
NEURALDEEP_BASKET_MAX_TOKENS=1800
VKUSVILL_MCP_URL=https://mcp.vkusvill.ru/mcp
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
MAX_SEARCH_QUERIES=5
MAX_SEARCH_RESULTS_PER_QUERY=4
MAX_CANDIDATES_FOR_LLM=16
MAX_BASKET_ITEMS_FROM_LLM=12
PORT=5174
```

Supabase Auth и профиль включаются только если заданы `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. Без них приложение остаётся в guest-режиме и хранит профиль в `localStorage`.

Миграция профилей лежит в `supabase/migrations/20260829_create_profiles.sql`: она создаёт `public.profiles`, включает RLS и разрешает пользователю работать только со своей строкой.

Опционально можно подключить каталог Пятёрочки через локальный MCP:

```bash
git clone https://github.com/dreamcatchered/pyaterochka-mcp-tool.git
cd pyaterochka-mcp-tool
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python mcp_http_server.py
```

После этого в `.env` приложения укажите локальный endpoint. Адрес можно выбрать в профиле приложения; env-поля магазина остаются fallback для локальной отладки:

```env
PYATEROCHKA_MCP_URL=http://127.0.0.1:8765/mcp
# опционально:
# PYATEROCHKA_STORE_ID=S105
# PYATEROCHKA_ADDRESS=Москва, Кировоградская улица, 17
PYATEROCHKA_SEARCH_RESULTS_PER_QUERY=4
```

Если переменные Пятёрочки не заданы, приложение работает только с ВкусВилл и не пытается подключаться к локальному MCP.

Опционально можно включить каталог доставки Ленты. Лента использует адрес профиля: сервер геокодирует его, выбирает ближайший hub, ищет товары в контексте магазина и повторно проверяет SKU перед показом корзины.

```env
LENTA_ENABLED=true
LENTA_API_BASE_URL=https://integration.api.lenta.com
LENTA_RETAIL_BRAND=lo
LENTA_CHANNEL=lo
LENTA_API_TIMEOUT_MS=5000
```

Перед включением в новой среде полезно прогнать API spike. Raw-ответы сохраняются в `.lenta-spike/` и не коммитятся:

```bash
node scripts/lenta-spike.mjs --lat 55.7558 --lon 37.6173 --lat 55.7512 --lon 37.6184 --lat 55.8078 --lon 37.6387
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
