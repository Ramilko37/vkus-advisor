import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2, Minus, Plus, RefreshCw, Send, ShoppingBasket, Trash2, UserRound } from "lucide-react";
import { CSSProperties, FormEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, useMemo, useRef, useState } from "react";
import type { BasketItem, BasketVariant, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";

type Planner = ReturnType<typeof useBasketPlanner>;

const examples = [
  { title: "Ужины на 3 дня", meta: "2 человека · до 3000 ₽ · без грибов", prompt: "Ужины на 3 дня для двоих до 3000 ₽, без грибов" },
  { title: "Белковая корзина", meta: "Рабочая неделя · для одного", prompt: "Белковая корзина на рабочую неделю для одного человека" },
  { title: "Почти без готовки", meta: "На 4 дня · быстрые блюда", prompt: "Максимально простая еда на 4 дня, почти без готовки" },
];

const stageLabels: Record<WorkflowStage, string> = {
  idle: "Готово помочь",
  analyzing: "Понимаю задачу",
  clarifying: "Нужно одно уточнение",
  searching: "Ищу подходящие товары",
  composing: "Собираю варианты",
  ready: "Готово к выбору",
  creatingCart: "Создаю ссылку",
  error: "Нужна правка",
};

export function AppShell({ children, route }: { children: ReactNode; route: "home" | "results" }) {
  return (
    <main className={`app-shell ${route}-route`}>
      <Header route={route} />
      <div className="workspace">
        {children}
      </div>
    </main>
  );
}

export function Header({ route }: { route: "home" | "results" }) {
  return (
    <header className="header" data-od-id="app-header">
      <button className="avatar-button" type="button" aria-label="Профиль"><UserRound size={18} /></button>
      {route === "home" && (
        <>
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true"><ShoppingBasket size={22} /></div>
            <div>
              <p className="brand-kicker">Сервис подбора продуктов</p>
              <h1>Умная корзина</h1>
            </div>
          </div>
          <p className="header-copy">Расскажите, что вам нужно. Мы соберём три варианта корзины.</p>
        </>
      )}
    </header>
  );
}

export function ConversationPanel({ planner }: { planner: Planner }) {
  const [text, setText] = useState("");
  const showMessages = planner.state.messages.length > 1 || planner.state.stage === "clarifying" || planner.state.stage === "error";
  const submit = (value = text) => {
    void planner.submit(value);
    setText("");
  };

  return (
    <section className="conversation-panel" aria-label="Разговор" data-od-id="conversation-panel">
      {showMessages && <MessageList messages={planner.state.messages} />}
      <IntentChips intent={planner.state.intent} />
      {planner.state.error && <ErrorNotice message={planner.state.error.message} onRetry={planner.retry} />}
      <ChatComposer value={text} onChange={setText} onSubmit={() => submit()} busy={["analyzing", "searching", "composing", "creatingCart"].includes(planner.state.stage)} />
      <CatalogStatus mode={planner.state.catalogMode} onReconnect={planner.reconnectCatalog} />
      <PromptExamples onPick={setText} />
      <p className="result-note">Подберём реальные товары и предложим три варианта: сбалансированный, экономный и быстрый.</p>
    </section>
  );
}

export function CatalogStatus({ mode, onReconnect }: { mode: "live" | "demo" | "connecting"; onReconnect: () => void }) {
  if (mode === "live") return null;
  const label = mode === "connecting" ? "Подключаем каталог..." : "Демонстрационный режим";
  return (
    <div className={`catalog-status ${mode}`} aria-live="polite">
      {mode === "connecting" ? <Loader2 className="spin" size={17} /> : <AlertTriangle size={17} />}
      <span>{label}</span>
      {mode === "demo" && <button type="button" onClick={onReconnect}><RefreshCw size={16} /> Повторить</button>}
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
    <div className="chips" aria-label="Извлечённые параметры">
      {chips.map((chip) => <span key={chip}>{chip}</span>)}
      {intent.assumptions.map((item) => <span key={item} className="assumption">{item}</span>)}
    </div>
  );
}

export function FullscreenLoader({ stage }: { stage: WorkflowStage }) {
  const notes: Record<string, string> = {
    analyzing: "Выделяю бюджет, дни и ограничения",
    searching: "Сверяю запросы с каталогом",
    composing: "Собираю три сценария корзины",
    creatingCart: "Готовлю ссылку на корзину",
  };

  return (
    <div className="liquid-loader-backdrop" role="status" aria-live="polite" aria-busy="true">
      <div className="liquid-loader-card">
        <div className="liquid-loader-mark" aria-hidden="true">
          <ShoppingBasket size={34} />
        </div>
        <div className="liquid-loader-copy">
          <span>{stageLabels[stage]}</span>
          <strong>{notes[stage] ?? "Обновляю подборку"}</strong>
          <small>AI подбирает продукты и проверяет варианты корзины</small>
        </div>
        <div className="liquid-loader-line" aria-hidden="true" />
      </div>
    </div>
  );
}

export function PromptExamples({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="examples" aria-label="Примеры запросов">
      <span className="examples-title">Попробуйте:</span>
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
    <form className="composer" onSubmit={handleSubmit}>
      <label htmlFor="basket-request">Что собрать?</label>
      <textarea id="basket-request" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ужины на 3 дня для двоих, до 3000 ₽, без грибов" rows={3} />
      <button type="submit" disabled={busy || !value.trim()} aria-label="Собрать корзину">
        {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        <span>{busy ? "Собираем..." : "Собрать корзину"}</span>
      </button>
    </form>
  );
}

export function BasketResults({ planner }: { planner: Planner }) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const didSwipe = useRef(false);
  const selected = planner.state.variants.find((variant) => variant.id === openedId) ?? null;
  const activeVariant = planner.state.variants[activeIndex] ?? planner.state.variants[0] ?? null;
  const activeId = activeVariant?.id ?? null;
  const openVariant = (id: string) => {
    planner.selectVariant(id);
    setOpenedId(id);
  };
  const moveDeck = (step: number) => {
    if (!planner.state.variants.length) return;
    setActiveIndex((index) => (index + step + planner.state.variants.length) % planner.state.variants.length);
  };
  const handleDeckPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
    didSwipe.current = false;
    setDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleDeckPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    setDragOffset(Math.max(-72, Math.min(72, dx)));
  };
  const handleDeckPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    setDragging(false);
    setDragOffset(0);
    if (!start) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    didSwipe.current = true;
    moveDeck(dx < 0 ? 1 : -1);
  };
  const handleDeckClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!didSwipe.current) return;
    event.preventDefault();
    event.stopPropagation();
    didSwipe.current = false;
  };
  const deckPosition = (index: number) => {
    const count = planner.state.variants.length;
    const offset = index - activeIndex;
    if (offset > count / 2) return offset - count;
    if (offset < -count / 2) return offset + count;
    return offset;
  };
  const deckStyle = {
    "--deck-drag": `${dragOffset}px`,
    "--deck-drag-side": `${dragOffset * 0.22}px`,
    "--deck-drag-rotate": `${dragOffset * -0.045}deg`,
  } as CSSProperties;
  return (
    <section className="results-panel" aria-label="Варианты корзины" data-od-id="results-panel">
      {planner.state.catalogMode === "demo" && <DemoModeBanner onReconnect={planner.reconnectCatalog} />}
      <div className="section-heading compact-heading">
        <div>
          <p className="section-kicker">Подборка</p>
          <h2>3 сценария корзины</h2>
        </div>
      </div>
      <div
        className={`deck-stage ${dragging ? "dragging" : ""}`}
        style={deckStyle}
        data-od-id="variant-grid"
        onPointerDown={handleDeckPointerDown}
        onPointerMove={handleDeckPointerMove}
        onPointerUp={handleDeckPointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
          setDragging(false);
          setDragOffset(0);
        }}
        onClickCapture={handleDeckClickCapture}
      >
        <button className="deck-nav prev" type="button" onClick={() => moveDeck(-1)} aria-label="Предыдущий вариант"><ChevronLeft size={20} /></button>
        {planner.state.variants.map((variant, index) => (
          <BasketVariantCard
            key={variant.id}
            variant={variant}
            active={variant.id === activeId}
            selected={variant.id === openedId}
            position={deckPosition(index)}
            onFocus={() => setActiveIndex(index)}
            onSelect={() => openVariant(variant.id)}
          />
        ))}
        <button className="deck-nav next" type="button" onClick={() => moveDeck(1)} aria-label="Следующий вариант"><ChevronRight size={20} /></button>
      </div>
      <div className="deck-dots" aria-hidden="true">
        {planner.state.variants.map((variant) => <span key={variant.id} className={variant.id === activeId ? "active" : ""} />)}
      </div>
      {selected && (
        <SelectedBasketActions
          variant={selected}
          mode={planner.state.catalogMode}
          creating={planner.state.stage === "creatingCart"}
          onItems={(items) => planner.updateItems(selected.id, items)}
          onCreateCart={planner.createCart}
        />
      )}
      <p className="disclaimer">Цены, наличие и актуальный состав проверяйте на карточках товаров перед оформлением заказа.</p>
      {planner.state.intent?.excludedIngredients.length ? <p className="disclaimer warning">Прототип не подтверждает отсутствие аллергенов. Обязательно проверяйте полный состав товара самостоятельно.</p> : null}
      <TechnicalDetails mode={planner.state.catalogMode} models={planner.state.modelNames} />
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
      <div className="variant-grid skeleton-grid" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <article className="variant-card skeleton-card" key={item}>
            <div className="skeleton-hero" />
            <div className="skeleton-line title" />
            <div className="skeleton-line short" />
            <div className="skeleton-line price-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line medium" />
            <div className="skeleton-button" />
          </article>
        ))}
      </div>
      <div className="deck-dots" aria-hidden="true"><span className="active" /><span /><span /></div>
    </section>
  );
}

export function BasketVariantCard({ variant, active, selected, position, onFocus, onSelect }: { variant: BasketVariant; active: boolean; selected: boolean; position: number; onFocus: () => void; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const visibleItems = open ? variant.items : variant.items.slice(0, 5);
  const normalizedPosition = Math.max(-1, Math.min(1, position));
  return (
    <article
      className={`variant-card ${active ? "active" : ""} ${selected ? "selected" : ""}`}
      data-position={normalizedPosition}
      data-od-id={`variant-card-${variant.id}`}
      onClick={active ? undefined : onFocus}
    >
      <div className="variant-heading">
        <div>
          <h2>{variant.title}</h2>
          <span>{variant.strategy === "balanced" ? "Компромисс" : variant.strategy === "budget" ? "Минимум стоимости" : "Меньше готовки"}</span>
        </div>
        {selected && <span className="selected-label"><Check size={15} /> Выбрано</span>}
      </div>
      <strong className="price">{variant.totalRub.toLocaleString("ru-RU")} ₽</strong>
      <p>{variant.summary}</p>
      <small>{variant.uniqueItemsCount} позиций</small>
      <ul className="item-preview">
        {visibleItems.map((item) => <li key={item.xmlId}><span>{item.name}</span><b>{item.quantity} шт.</b></li>)}
      </ul>
      {variant.items.length > 5 && <button className="link-button" type="button" onClick={() => setOpen(!open)}><ChevronDown size={16} /> {open ? "Свернуть" : "Показать все"}</button>}
      <ul className="tradeoffs">{variant.tradeoffs.map((item) => <li key={item}>{item}</li>)}</ul>
      {variant.warnings.map((warning) => <p className="warning-line" key={warning}><AlertTriangle size={15} /> {warning}</p>)}
      <button type="button" className={selected ? "secondary-button full" : active ? "primary-button full" : "secondary-button full"} onClick={active ? onSelect : onFocus}>{selected ? "Открыто" : active ? "Открыть" : "Посмотреть"}</button>
    </article>
  );
}

export function BasketItemRow({ item, onQuantity, onDelete }: { item: BasketItem; onQuantity: (quantity: number) => void; onDelete: () => void }) {
  return (
    <div className="basket-row">
      <div>
        <strong>{item.name}</strong>
        <span>{item.role} · {item.reason}</span>
        {item.weightLabel && <small>{item.weightLabel}</small>}
      </div>
      <div className="quantity">
        <button type="button" onClick={() => onQuantity(item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Уменьшить"><Minus size={15} /></button>
        <b>{item.quantity}</b>
        <button type="button" onClick={() => onQuantity(item.quantity + 1)} disabled={item.quantity >= 9} aria-label="Увеличить"><Plus size={15} /></button>
      </div>
      <b>{Math.round(item.priceRub * item.quantity).toLocaleString("ru-RU")} ₽</b>
      <button type="button" className="icon-button" onClick={onDelete} aria-label="Удалить"><Trash2 size={16} /></button>
    </div>
  );
}

export function SelectedBasketActions({ variant, mode, creating, onItems, onCreateCart }: { variant: BasketVariant; mode: "live" | "demo" | "connecting"; creating: boolean; onItems: (items: BasketItem[]) => void; onCreateCart: () => Promise<string | null> }) {
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const list = useMemo(() => variant.items.map((item) => `${item.quantity} × ${item.name} — ${Math.round(item.priceRub * item.quantity)} ₽`).join("\n"), [variant.items]);
  const copy = () => void navigator.clipboard.writeText(list);
  const update = (xmlId: string, quantity: number) => onItems(variant.items.map((item) => item.xmlId === xmlId ? { ...item, quantity: Math.min(9, Math.max(1, quantity)) } : item));
  const remove = (xmlId: string) => onItems(variant.items.filter((item) => item.xmlId !== xmlId));

  return (
    <section className="selected-basket" data-od-id="selected-basket">
      <div className="section-heading">
        <div>
          <h2>Состав выбранной корзины: {variant.title}</h2>
          <p>{variant.totalRub.toLocaleString("ru-RU")} ₽ · {variant.uniqueItemsCount} позиций</p>
        </div>
        <button className="secondary-button" type="button" onClick={copy}><Copy size={17} /> Скопировать список</button>
      </div>
      <div className="rows">
        {variant.items.map((item) => <BasketItemRow key={item.xmlId} item={item} onQuantity={(quantity) => update(item.xmlId, quantity)} onDelete={() => remove(item.xmlId)} />)}
      </div>
      {mode === "demo" ? (
        <p className="demo-note">MCP недоступен из браузера, поэтому сейчас используется демонстрационный каталог. Сумма рассчитана по демонстрационным данным.</p>
      ) : cartUrl ? (
        <a className="primary-button full" href={cartUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Открыть корзину во ВкусВилле</a>
      ) : (
        <button className="primary-button full" type="button" disabled={creating} onClick={async () => setCartUrl(await onCreateCart())}>
          {creating ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />} Создать ссылку на корзину
        </button>
      )}
    </section>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-notice" aria-live="polite">
      <AlertTriangle size={18} />
      <span>{message}</span>
      <button type="button" onClick={onRetry}>Повторить</button>
    </div>
  );
}

export function DemoModeBanner({ onReconnect }: { onReconnect: () => void }) {
  return (
    <div className="demo-banner">
      <AlertTriangle size={18} />
      <span>MCP недоступен из браузера, поэтому сейчас используется демонстрационный каталог.</span>
      <button type="button" onClick={onReconnect}>Повторить подключение</button>
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
