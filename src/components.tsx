import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, Leaf, Loader2, Minus, Plus, RefreshCw, Send, Server, ShoppingBasket, Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import type { BasketItem, BasketVariant, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";

type Planner = ReturnType<typeof useBasketPlanner>;

const examples = [
  "Ужины на 3 дня для двоих до 3000 ₽, без грибов",
  "Белковая корзина на рабочую неделю для одного человека",
  "Максимально простая еда на 4 дня, почти без готовки",
  "Завтраки для семьи с ребёнком на 5 дней",
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

export function AppShell({ conversation, results }: { conversation: ReactNode; results: ReactNode }) {
  return (
    <main className="app-shell">
      <Header />
      <div className="workspace">
        {conversation}
        {results}
      </div>
    </main>
  );
}

export function Header() {
  return (
    <header className="header">
      <div className="brand-mark" aria-hidden="true"><ShoppingBasket size={24} /></div>
      <div>
        <h1>Корзина под задачу</h1>
        <p>Расскажите, для кого, на сколько дней и с какими ограничениями нужна корзина. Мы предложим три варианта.</p>
      </div>
      <span className="prototype-note">Неофициальный экспериментальный прототип.</span>
    </header>
  );
}

export function ConversationPanel({ planner }: { planner: Planner }) {
  const [text, setText] = useState("");
  const submit = (value = text) => {
    void planner.submit(value);
    setText("");
  };

  return (
    <section className="conversation-panel" aria-label="Разговор">
      <div className="panel-top">
        <CatalogStatus mode={planner.state.catalogMode} onReconnect={planner.reconnectCatalog} />
        <span className="server-key-status"><Server size={17} /> OpenRouter через сервер</span>
      </div>
      <MessageList messages={planner.state.messages} />
      <IntentChips intent={planner.state.intent} />
      <WorkflowProgress stage={planner.state.stage} />
      <PromptExamples onPick={setText} />
      {planner.state.error && <ErrorNotice message={planner.state.error.message} onRetry={planner.retry} />}
      <ChatComposer value={text} onChange={setText} onSubmit={() => submit()} busy={["analyzing", "searching", "composing", "creatingCart"].includes(planner.state.stage)} />
    </section>
  );
}

export function CatalogStatus({ mode, onReconnect }: { mode: "live" | "demo" | "connecting"; onReconnect: () => void }) {
  const label = mode === "connecting" ? "Подключение к ВкусВиллу" : mode === "live" ? "Каталог подключён" : "Демо-режим";
  return (
    <div className={`catalog-status ${mode}`}>
      <span className="status-dot" />
      <span>{label}</span>
      {mode !== "live" && <button type="button" className="icon-button" onClick={onReconnect} aria-label="Повторить подключение"><RefreshCw size={16} /></button>}
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

export function WorkflowProgress({ stage }: { stage: WorkflowStage }) {
  const steps = ["analyzing", "searching", "composing", "ready"] as const;
  const current = Math.max(0, steps.indexOf(stage as (typeof steps)[number]));
  return (
    <div className="progress" aria-live="polite">
      <strong>{stageLabels[stage]}</strong>
      <div className="progress-track">
        {steps.map((step, index) => <span key={step} className={index <= current ? "active" : ""}>{index + 1}</span>)}
      </div>
    </div>
  );
}

export function PromptExamples({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="examples">
      {examples.map((example) => <button key={example} type="button" onClick={() => onPick(example)}>{example}</button>)}
    </div>
  );
}

export function ChatComposer({ value, onChange, onSubmit, busy }: { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean }) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Например: завтраки и ужины на три дня для двоих..." rows={4} />
      <button type="submit" disabled={busy || !value.trim()} aria-label="Отправить"><Send size={20} /></button>
    </form>
  );
}

export function BasketResults({ planner }: { planner: Planner }) {
  const selected = planner.state.variants.find((variant) => variant.id === planner.state.selectedId) ?? null;
  return (
    <section className="results-panel" aria-label="Варианты корзины">
      {planner.state.catalogMode === "demo" && <DemoModeBanner onReconnect={planner.reconnectCatalog} />}
      {planner.state.variants.length === 0 ? <EmptyResultsState /> : (
        <>
          <div className="variant-grid">
            {planner.state.variants.map((variant) => (
              <BasketVariantCard key={variant.id} variant={variant} selected={variant.id === planner.state.selectedId} onSelect={() => planner.selectVariant(variant.id)} />
            ))}
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
        </>
      )}
    </section>
  );
}

export function BasketVariantCard({ variant, selected, onSelect }: { variant: BasketVariant; selected: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const visibleItems = open ? variant.items : variant.items.slice(0, 5);
  return (
    <article className={`variant-card ${selected ? "selected" : ""}`}>
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
      <button type="button" className={selected ? "secondary-button full" : "primary-button full"} onClick={onSelect}>Выбрать</button>
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
    <section className="selected-basket">
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

export function EmptyResultsState() {
  return (
    <div className="empty-state">
      <Leaf size={44} />
      <h2>Опишите задачу, а не список продуктов</h2>
      <p>Например: завтраки и ужины на три дня для двоих, бюджет до 3500 ₽, без грибов, готовить не больше 20 минут.</p>
    </div>
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
