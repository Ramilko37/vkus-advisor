import { AlertTriangle, ChevronLeft, Copy, ExternalLink, Loader2, Minus, Plus, RefreshCw, ShoppingBasket, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { BasketItem, BasketPriority, BasketVariant, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";

type Planner = ReturnType<typeof useBasketPlanner>;

const examples = [
  { title: "Ужины на 3 дня", meta: "2 человека · до 3000 ₽ · без грибов", prompt: "Ужины на 3 дня для двоих до 3000 ₽, без грибов" },
  { title: "Белковая корзина", meta: "Рабочая неделя · для одного", prompt: "Белковая корзина на рабочую неделю для одного человека" },
  { title: "Почти без готовки", meta: "На 4 дня · быстрые блюда", prompt: "Максимально простая еда на 4 дня, почти без готовки" },
];

const briefChips = [
  { label: "3 дня", fragment: "на 3 дня" },
  { label: "для двоих", fragment: "для двоих" },
  { label: "до 3000 ₽", fragment: "до 3000 ₽" },
  { label: "без грибов", fragment: "без грибов" },
  { label: "быстро", fragment: "почти без готовки" },
];

const scenarioOnboarding = [
  { title: "Баланс", text: "цена + время" },
  { title: "Экономия", text: "дешевле" },
  { title: "Быстрее", text: "меньше готовки" },
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
  if (mode !== "demo") return null;

  return (
    <div className="catalog-status demo" aria-live="polite">
      <AlertTriangle size={17} />
      <span>Показываем пример корзины. Можно скопировать список или попробовать подключить каталог ещё раз.</span>
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
    <div className="examples" aria-label="Готовые запросы">
      {examples.map((example) => (
        <button key={example.prompt} type="button" onClick={() => onPick(example.prompt)}>
          <span>{example.title}</span>
          <small>{example.meta}</small>
        </button>
      ))}
    </div>
  );
}

export function ChatComposer({ value, onChange, onSubmit, busy }: { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = value.trim().length > 0;
  const canSubmit = hasText && !busy;
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };
  const addBriefChip = (fragment: string) => {
    onChange(appendBriefFragment(value, fragment));
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <form className="composer vv-chat-composer liquid-glass" onSubmit={handleSubmit}>
      <div className="composer-head">
        <label htmlFor="basket-request">Что собрать?</label>
        <p id="basket-request-hint">Добавьте срок, людей, бюджет или ограничения.</p>
      </div>
      <ul className="scenario-onboarding" aria-label="После запроса покажем три сценария корзины">
        {scenarioOnboarding.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <div className="brief-chips" aria-label="Быстро добавить параметры">
        {briefChips.map((chip) => (
          <button key={chip.fragment} type="button" onClick={() => addBriefChip(chip.fragment)}>
            {chip.label}
          </button>
        ))}
      </div>
      <div className="composer-input-shell">
        <textarea
          id="basket-request"
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Например: ужины для двоих, без грибов"
          rows={3}
          aria-describedby="basket-request-hint"
        />
        <button type="submit" disabled={busy || !hasText} aria-label={hasText ? "Собрать корзину" : "Опишите задачу"} aria-keyshortcuts="Control+Enter Meta+Enter">
          {busy ? <Loader2 className="spin" size={18} /> : <ShoppingBasket size={18} />}
          <span>{busy ? "Собираем..." : hasText ? "Собрать" : "Опишите задачу"}</span>
        </button>
      </div>
    </form>
  );
}

function appendBriefFragment(value: string, fragment: string) {
  const trimmed = value.trim();
  if (!trimmed) return fragment;
  if (trimmed.toLocaleLowerCase("ru-RU").includes(fragment.toLocaleLowerCase("ru-RU"))) return value;
  return `${trimmed}, ${fragment}`;
}

export function BasketResults({ planner }: { planner: Planner }) {
  const [openedId, setOpenedId] = useState<string | null>(planner.state.selectedId);
  const variants = planner.state.variants;
  const selected = planner.state.variants.find((variant) => variant.id === openedId) ?? null;
  const balancedTotal = planner.state.variants.find((variant) => variant.strategy === "balanced")?.totalRub ?? planner.state.variants[0]?.totalRub ?? null;
  const openVariant = (id: string) => {
    planner.selectVariant(id);
    setOpenedId(id);
    scrollToTop();
  };

  useEffect(() => {
    if (planner.state.selectedId && !openedId) setOpenedId(planner.state.selectedId);
  }, [openedId, planner.state.selectedId]);

  if (selected) {
    return (
      <section className="results-panel kit-results basket-step" aria-label="Состав выбранной корзины" data-od-id="results-panel">
        <div className="basket-step-header">
          <button className="link-button step-back liquid-glass" type="button" onClick={() => {
            planner.clearVariantSelection();
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
      <div className="variant-list compare-list" data-od-id="variant-grid">
        {variants.map((variant) => (
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

export function EmptyResultsState({ onStart }: { onStart: () => void }) {
  return (
    <section className="results-panel empty-results-panel" aria-label="Подборка не найдена" data-od-id="empty-results-panel">
      <div className="empty-state liquid-glass">
        <ShoppingBasket aria-hidden="true" />
        <h2>Подборка не найдена</h2>
        <p>Здесь появятся варианты корзины после запроса. Можно вернуться и собрать новую умную корзину.</p>
        <button className="primary-button" type="button" onClick={onStart}>Собрать корзину</button>
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
  const priceDelta = balancedTotal === null || variant.strategy === "balanced" ? null : variant.totalRub - balancedTotal;
  const priceTone = priceDelta === null ? "Базовый вариант" : priceDelta < 0 ? `−${Math.abs(priceDelta).toLocaleString("ru-RU")} ₽ к балансу` : `+${priceDelta.toLocaleString("ru-RU")} ₽ к балансу`;
  const difference = strategyDifferences[variant.strategy] ?? variant.summary;

  return (
    <article className="variant-card vv-basket-variant-card" data-od-id={`variant-card-${variant.id}`}>
      <button className="variant-card-button" type="button" onClick={onSelect} aria-label={`Открыть корзину ${variant.title}`}>
        <div className="variant-card-top">
          <div>
            <h2>{strategyLabels[variant.strategy] ?? variant.title}</h2>
          </div>
          {recommended && <strong className="recommend-badge">Рекомендуем</strong>}
        </div>
        <strong className="price">{variant.totalRub.toLocaleString("ru-RU")} ₽</strong>
        <div className="variant-compare-line">
          <span>{variant.uniqueItemsCount} позиций</span>
          <span>{priceTone}</span>
        </div>
        <p className="variant-difference">{difference}</p>
        <span className="variant-card-action">Открыть</span>
      </button>
    </article>
  );
}

const strategyDifferences: Record<BasketPriority, string> = {
  balanced: "Цена и готовка в балансе.",
  budget: "Дешевле, но больше готовки.",
  speed: "Дороже, зато быстрее.",
};

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
        {mode === "demo" && <p className="demo-note">Это пример корзины: цены и товары нужны для ориентира. Список можно скопировать.</p>}
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
        <button className="primary-button checkout-button" type="button" disabled>Ссылка недоступна</button>
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
      <span>Каталог не ответил, поэтому показываем пример. Его можно открыть, сравнить и скопировать.</span>
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
