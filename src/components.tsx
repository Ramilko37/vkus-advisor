import { AlertTriangle, ChevronLeft, Copy, ExternalLink, Loader2, Minus, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, ReactNode, useMemo, useState } from "react";
import type { BasketItem, BasketPriority, BasketVariant, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";

type Planner = ReturnType<typeof useBasketPlanner>;

const examples = [
  { title: "Ужины на 3 дня", meta: "2 человека · до 3000 ₽ · без грибов", prompt: "Ужины на 3 дня для двоих до 3000 ₽, без грибов" },
  { title: "Белковая корзина", meta: "Рабочая неделя · для одного", prompt: "Белковая корзина на рабочую неделю для одного человека" },
  { title: "Почти без готовки", meta: "На 4 дня · быстрые блюда", prompt: "Максимально простая еда на 4 дня, почти без готовки" },
];

const stageLabels: Record<WorkflowStage, string> = {
  idle: "Готово",
  analyzing: "Разбираем запрос",
  clarifying: "Нужно уточнение",
  searching: "Ищем товары",
  composing: "Собираем варианты",
  ready: "Готово к выбору",
  creatingCart: "Готовим корзину",
  error: "Нужна правка",
};

const strategyLabels: Record<BasketPriority, string> = {
  balanced: "Сбалансированная",
  budget: "Экономная",
  speed: "Самая простая",
};

const strategyMeta: Record<BasketPriority, string> = {
  balanced: "Компромисс цены и удобства",
  budget: "Минимум стоимости",
  speed: "Меньше готовки",
};

const roleLabels: Record<string, string> = {
  breakfast: "Завтрак",
  main: "Основное",
  protein: "Белок",
  side: "Гарнир",
  vegetables: "Овощи",
  snack: "Перекус",
  ready_food: "Готовая еда",
  drink: "Напиток",
  other: "Продукт",
};

function scrollToTop() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export function AppShell({ children, route }: { children: ReactNode; route: "home" | "results" }) {
  return (
    <main className={`app-shell kit-shell ${route}-route`} data-g2-mode="compact">
      <Header route={route} />
      <div className="workspace">
        {children}
      </div>
    </main>
  );
}

export function Header({ route }: { route: "home" | "results" }) {
  if (route === "results") return null;

  return (
    <header className="header vv-preview-header" data-od-id="app-header">
      <p className="brand-kicker vv-kicker">ВкусВилл Advisor</p>
      <h1 className="vv-title">Умная корзина</h1>
      <p className="header-copy vv-copy">Расскажите, что нужно купить — подберём три варианта.</p>
    </header>
  );
}

export function ConversationPanel({ planner }: { planner: Planner }) {
  const [text, setText] = useState("");
  const showMessages = planner.state.messages.length > 1 || planner.state.stage === "clarifying" || planner.state.stage === "error";
  const busy = ["analyzing", "searching", "composing", "creatingCart"].includes(planner.state.stage);
  const submit = (value = text) => {
    void planner.submit(value);
    setText("");
  };

  return (
    <section className="conversation-panel kit-home" aria-label="Подбор корзины" data-od-id="conversation-panel">
      {showMessages && <MessageList messages={planner.state.messages} />}
      <ChatComposer value={text} onChange={setText} onSubmit={() => submit()} busy={busy} />
      <IntentChips intent={planner.state.intent} />
      {planner.state.error && <ErrorNotice message={planner.state.error.message} onRetry={planner.retry} />}
      <CatalogStatus mode={planner.state.catalogMode} onReconnect={planner.reconnectCatalog} />
      <PromptExamples onPick={setText} />
    </section>
  );
}

export function CatalogStatus({ mode, onReconnect }: { mode: "live" | "demo" | "connecting"; onReconnect: () => void }) {
  if (mode === "live") return null;

  if (mode === "connecting") {
    return (
      <div className="catalog-status connecting" aria-live="polite">
        <Loader2 className="spin" size={17} />
        <span>Подключаем каталог...</span>
      </div>
    );
  }

  return (
    <div className="catalog-status demo" aria-live="polite">
      <AlertTriangle size={17} />
      <span>Каталог временно недоступен. Показываем пример на тестовых товарах.</span>
      <button type="button" onClick={onReconnect}><RefreshCw size={16} /> Повторить</button>
    </div>
  );
}

export function MessageList({ messages }: { messages: Planner["state"]["messages"] }) {
  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
    </div>
  );
}

export function MessageBubble({ message }: { message: Planner["state"]["messages"][number] }) {
  return (
    <article className={`message ${message.role}`}>
      <p>{message.content}</p>
      <time>{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time>
    </article>
  );
}

export function IntentChips({ intent }: { intent: Planner["state"]["intent"] }) {
  if (!intent) return null;
  const chips = [
    `${intent.people} чел.`,
    `${intent.days} дн.`,
    intent.budgetRub ? `до ${intent.budgetRub.toLocaleString("ru-RU")} ₽` : "без бюджета",
    intent.meals.join(", "),
    intent.maxCookingMinutes ? `до ${intent.maxCookingMinutes} мин` : "время не задано",
    intent.excludedIngredients.length ? `без: ${intent.excludedIngredients.join(", ")}` : "без исключений",
    intent.priority === "budget" ? "экономия" : intent.priority === "speed" ? "проще" : "баланс",
  ];
  return (
    <div className="chips" aria-label="Параметры запроса">
      {chips.map((chip) => <span key={chip}>{chip}</span>)}
      {intent.assumptions.map((item) => <span key={item} className="assumption">{item}</span>)}
    </div>
  );
}

export function FullscreenLoader({ stage }: { stage: WorkflowStage }) {
  const steps: Array<{ id: WorkflowStage; title: string; text: string }> = [
    { id: "analyzing", title: "Запрос", text: "Выделяем дни, бюджет и ограничения" },
    { id: "searching", title: "Каталог", text: "Ищем подходящие товары" },
    { id: "composing", title: "Варианты", text: "Сравниваем три корзины" },
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === stage));

  return (
    <div className="liquid-loader-backdrop" role="status" aria-live="polite" aria-busy="true">
      <div className="liquid-loader-card liquid-glass">
        <p className="loader-kicker">{stageLabels[stage]}</p>
        <h2>{stage === "creatingCart" ? "Готовим ссылку на корзину" : "Подбираем корзину"}</h2>
        <ol className="loader-steps">
          {steps.map((step, index) => (
            <li key={step.id} className={index < activeIndex ? "done" : index === activeIndex ? "current" : ""}>
              <span aria-hidden="true">{index < activeIndex ? "✓" : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.text}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function PromptExamples({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="examples" aria-label="Примеры запросов">
      {examples.map((example) => (
        <button key={example.prompt} type="button" onClick={() => onPick(example.prompt)}>
          <span>{example.title}</span>
          <small>{example.meta}</small>
          <b aria-hidden="true">›</b>
        </button>
      ))}
    </div>
  );
}

export function ChatComposer({ value, onChange, onSubmit, busy }: { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean }) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };
  return (
    <form className="composer vv-chat-composer liquid-glass" onSubmit={handleSubmit}>
      <label htmlFor="basket-request">Что собрать?</label>
      <textarea id="basket-request" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Например: ужины на 3 дня для двоих, до 3000 ₽, без грибов" rows={3} />
      <button type="submit" disabled={busy || !value.trim()} aria-label="Собрать корзину">
        {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        <span>{busy ? "Собираем..." : "Собрать"}</span>
      </button>
    </form>
  );
}

export function BasketResults({ planner }: { planner: Planner }) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const selected = planner.state.variants.find((variant) => variant.id === openedId) ?? null;
  const balancedTotal = planner.state.variants.find((variant) => variant.strategy === "balanced")?.totalRub ?? planner.state.variants[0]?.totalRub ?? null;
  const openVariant = (id: string) => {
    planner.selectVariant(id);
    setOpenedId(id);
    scrollToTop();
  };

  if (selected) {
    return (
      <section className="results-panel kit-results basket-step" aria-label="Состав выбранной корзины" data-od-id="results-panel">
        <div className="basket-step-header">
          <button className="link-button step-back liquid-glass" type="button" onClick={() => {
            setOpenedId(null);
            scrollToTop();
          }}>
            <ChevronLeft size={17} /> К вариантам
          </button>
        </div>
        <SelectedBasketActions
          variant={selected}
          mode={planner.state.catalogMode}
          creating={planner.state.stage === "creatingCart"}
          onItems={(items) => planner.updateItems(selected.id, items)}
          onCreateCart={planner.createCart}
        />
      </section>
    );
  }

  return (
    <section className="results-panel kit-results" aria-label="Варианты корзины" data-od-id="results-panel">
      <div className="section-heading compact-heading">
        <div>
          <p className="section-kicker">Подборка</p>
          <h2>3 сценария корзины</h2>
        </div>
      </div>
      {planner.state.catalogMode === "demo" && <DemoModeBanner onReconnect={planner.reconnectCatalog} />}
      <div className="variant-list" data-od-id="variant-grid">
        {planner.state.variants.map((variant) => (
          <BasketVariantCard
            key={variant.id}
            variant={variant}
            recommended={variant.strategy === "balanced"}
            balancedTotal={balancedTotal}
            onSelect={() => openVariant(variant.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function BasketResultsSkeleton({ stage }: { stage: WorkflowStage }) {
  return (
    <section className="results-panel skeleton-panel" aria-label="Варианты корзины загружаются" aria-busy="true">
      <div className="section-heading compact-heading">
        <div>
          <p className="section-kicker">Подборка</p>
          <h2>{stageLabels[stage] ?? "Собираем варианты"}</h2>
        </div>
      </div>
      <div className="variant-list skeleton-list" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <article className="variant-card skeleton-card" key={item}>
            <div className="skeleton-line title" />
            <div className="skeleton-line short" />
            <div className="skeleton-line price-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line medium" />
            <div className="skeleton-line" />
          </article>
        ))}
      </div>
    </section>
  );
}

export function BasketVariantCard({ variant, recommended, balancedTotal, onSelect }: { variant: BasketVariant; recommended: boolean; balancedTotal: number | null; onSelect: () => void }) {
  const visibleItems = variant.items.slice(0, 3);
  const priceDelta = balancedTotal === null || variant.strategy === "balanced" ? null : variant.totalRub - balancedTotal;
  const tradeoff = formatTradeoff(variant.tradeoffs[0], variant.strategy);
  const priceTone = priceDelta === null ? "Компромисс" : priceDelta < 0 ? `На ${Math.abs(priceDelta).toLocaleString("ru-RU")} ₽ дешевле` : `На ${priceDelta.toLocaleString("ru-RU")} ₽ дороже`;
  const usefulSummary = strategySummaries[variant.strategy] ?? variant.summary;

  return (
    <article className="variant-card vv-basket-variant-card" data-od-id={`variant-card-${variant.id}`}>
      <button className="variant-card-button" type="button" onClick={onSelect} aria-label={`Открыть вариант ${variant.title}`}>
        <div className="variant-card-top">
          <div>
            <h2>{strategyLabels[variant.strategy] ?? variant.title}</h2>
            <span>{strategyMeta[variant.strategy] ?? variant.title}</span>
          </div>
          {recommended && <strong className="recommend-badge">Рекомендуем</strong>}
        </div>
        <strong className="price">{variant.totalRub.toLocaleString("ru-RU")} ₽</strong>
        <p className="variant-summary">{usefulSummary}</p>
        <dl className="variant-metrics">
          <div>
            <dt>Позиций</dt>
            <dd>{variant.uniqueItemsCount}</dd>
          </div>
          <div>
            <dt>Сравнение</dt>
            <dd>{priceTone}</dd>
          </div>
        </dl>
        <ul className="item-preview">
          {visibleItems.map((item) => <li key={item.xmlId}><span>{item.name}</span><b>{item.quantity} шт.</b></li>)}
        </ul>
        <p className="tradeoff-line">{tradeoff}</p>
      </button>
    </article>
  );
}

const strategySummaries: Record<BasketPriority, string> = {
  balanced: "Подходит, если важны цена и простая готовка.",
  budget: "Подходит, если нужно уложиться в минимум стоимости.",
  speed: "Подходит, если важны быстрые блюда без лишней подготовки.",
};

function formatTradeoff(tradeoff: string | undefined, strategy: BasketPriority) {
  if (!tradeoff || /не самый деш[её]в/i.test(tradeoff)) {
    if (strategy === "budget") return "Самый бережный вариант, но выбор блюд проще.";
    if (strategy === "speed") return "Не самый дешёвый, зато меньше времени на готовку.";
    return "Не самый дешёвый, зато меньше компромиссов по блюдам.";
  }
  return tradeoff;
}

export function BasketItemRow({ item, onQuantity, onDelete }: { item: BasketItem; onQuantity: (quantity: number) => void; onDelete: () => void }) {
  return (
    <div className="basket-row vv-basket-item-row">
      <ProductThumb item={item} />
      <div className="basket-row-copy">
        <strong>{item.name}</strong>
        <span>{item.weightLabel ?? roleLabels[item.role] ?? "Продукт"}</span>
      </div>
      <div className="basket-row-actions">
        <div className="quantity" aria-label={`Количество: ${item.name}`}>
          <button type="button" onClick={() => onQuantity(item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Уменьшить"><Minus size={16} /></button>
          <b>{item.quantity}</b>
          <button type="button" onClick={() => onQuantity(item.quantity + 1)} disabled={item.quantity >= 9} aria-label="Увеличить"><Plus size={16} /></button>
        </div>
        <button type="button" className="icon-button" onClick={onDelete} aria-label="Удалить"><Trash2 size={17} /></button>
      </div>
      <b className="row-price">{Math.round(item.priceRub * item.quantity).toLocaleString("ru-RU")} ₽</b>
    </div>
  );
}

function ProductThumb({ item }: { item: BasketItem }) {
  if (item.imageUrl) {
    return <img className="product-thumb" src={item.imageUrl} alt="" loading="lazy" />;
  }

  return (
    <span className="product-thumb placeholder" aria-hidden="true">
      {item.name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SelectedBasketActions({ variant, mode, creating, onItems, onCreateCart }: { variant: BasketVariant; mode: "live" | "demo" | "connecting"; creating: boolean; onItems: (items: BasketItem[]) => void; onCreateCart: () => Promise<string | null> }) {
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const list = useMemo(() => variant.items.map((item) => `${item.quantity} × ${item.name} — ${Math.round(item.priceRub * item.quantity)} ₽`).join("\n"), [variant.items]);
  const copy = () => void navigator.clipboard.writeText(list);
  const update = (xmlId: string, quantity: number) => onItems(variant.items.map((item) => item.xmlId === xmlId ? { ...item, quantity: Math.min(9, Math.max(1, quantity)) } : item));
  const remove = (xmlId: string) => onItems(variant.items.filter((item) => item.xmlId !== xmlId));

  return (
    <>
      <section className="selected-basket vv-selected-basket" data-od-id="selected-basket">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Выбранная корзина</p>
            <h2>{variant.title}</h2>
            <p>{variant.totalRub.toLocaleString("ru-RU")} ₽ · {variant.uniqueItemsCount} позиций</p>
          </div>
          <button className="secondary-button" type="button" onClick={copy}><Copy size={17} /> Скопировать</button>
        </div>
        <div className="rows">
          {variant.items.map((item) => <BasketItemRow key={item.xmlId} item={item} onQuantity={(quantity) => update(item.xmlId, quantity)} onDelete={() => remove(item.xmlId)} />)}
        </div>
        {mode === "demo" && <p className="demo-note">Каталог временно недоступен. Сумма рассчитана по тестовым данным.</p>}
      </section>
      <CheckoutBar
        totalRub={variant.totalRub}
        itemCount={variant.uniqueItemsCount}
        mode={mode}
        creating={creating}
        cartUrl={cartUrl}
        onCreateCart={async () => setCartUrl(await onCreateCart())}
      />
    </>
  );
}

function CheckoutBar({ totalRub, itemCount, mode, creating, cartUrl, onCreateCart }: { totalRub: number; itemCount: number; mode: "live" | "demo" | "connecting"; creating: boolean; cartUrl: string | null; onCreateCart: () => Promise<void> }) {
  const label = `${totalRub.toLocaleString("ru-RU")} ₽`;

  return (
    <div className="checkout-bar vv-checkout-bar liquid-glass">
      <div>
        <strong>{label}</strong>
        <span>{itemCount} позиций</span>
      </div>
      {mode === "demo" ? (
        <button className="primary-button checkout-button" type="button" disabled>Каталог недоступен</button>
      ) : cartUrl ? (
        <a className="primary-button checkout-button" href={cartUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Открыть</a>
      ) : (
        <button className="primary-button checkout-button" type="button" disabled={creating} onClick={onCreateCart}>
          {creating ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />} Создать ссылку
        </button>
      )}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-notice" aria-live="polite">
      <AlertTriangle size={18} />
      <span>{message}</span>
      <button type="button" onClick={onRetry}><RefreshCw size={16} /> Повторить</button>
    </div>
  );
}

export function DemoModeBanner({ onReconnect }: { onReconnect: () => void }) {
  return (
    <div className="demo-banner">
      <AlertTriangle size={18} />
      <span>Каталог временно недоступен. Ниже показан тестовый пример.</span>
      <button type="button" onClick={onReconnect}>Повторить</button>
    </div>
  );
}

export function TechnicalDetails({ mode, models }: { mode: string; models: string[] }) {
  return (
    <details className="technical">
      <summary>Техническая информация</summary>
      <p>Каталог: {mode}</p>
      <p>Модель: {models[models.length - 1] ?? "ещё не вызывалась"}</p>
    </details>
  );
}
