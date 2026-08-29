import { AlertTriangle, ChevronLeft, Copy, ExternalLink, Loader2, MapPin, Minus, Plus, RefreshCw, ShoppingBasket, Trash2, User, X } from "lucide-react";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { BasketItem, BasketVariant, UserProfile, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";
import type { AuthStatus } from "./hooks/useAuthProfile";
import { DEFAULT_PROFILE, normalizeProfile } from "./services/profileRepository";
import { getVariantPresentation } from "./services/variantPresentation";
import { summarizeIntentSlots } from "./services/requestCopy";

type Planner = ReturnType<typeof useBasketPlanner>;
type AuthProfile = {
  authConfigured: boolean;
  authError: string | null;
  authStatus: AuthStatus;
  profile: UserProfile;
  sendOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (profile: UserProfile) => void;
};

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

export function AppShell({ children, route, authProfile }: { children: ReactNode; route: "home" | "results"; authProfile: AuthProfile }) {
  return (
    <main className={`app-shell kit-shell ${route}-route`} data-g2-mode="compact">
      <ProfileControl
        profile={authProfile.profile}
        authConfigured={authProfile.authConfigured}
        authStatus={authProfile.authStatus}
        authError={authProfile.authError}
        onChange={authProfile.updateProfile}
        onSendOtp={authProfile.sendOtp}
        onSignOut={authProfile.signOut}
      />
      <Header route={route} />
      <div className="workspace">
        {children}
      </div>
    </main>
  );
}

export function ProfileControl({
  profile,
  authConfigured,
  authStatus,
  authError,
  onChange,
  onSendOtp,
  onSignOut,
}: {
  profile: UserProfile;
  authConfigured: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  onChange: (profile: UserProfile) => void;
  onSendOtp: (email: string) => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserProfile>(() => normalizeProfile(profile));
  const [email, setEmail] = useState(profile.email ?? "");
  const hasAddress = profile.address.length > 0;
  const save = (event: FormEvent) => {
    event.preventDefault();
    onChange(normalizeProfile(draft));
    setOpen(false);
  };
  const saveField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const parseList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

  useEffect(() => {
    if (open) {
      setDraft(normalizeProfile(profile));
      setEmail(profile.email ?? "");
    }
  }, [open, profile]);

  return (
    <>
      <button className={`profile-trigger liquid-glass ${hasAddress ? "has-address" : ""}`} type="button" onClick={() => setOpen(true)} aria-label={hasAddress ? `Адрес: ${profile.address}` : "Добавить адрес"}>
        {hasAddress ? <MapPin size={19} /> : <User size={19} />}
      </button>
      {open && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <form className="dialog profile-dialog liquid-glass" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close-button" type="button" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={18} /></button>
            <p className="section-kicker">Профиль</p>
            <h2 id="profile-title">Адрес доставки</h2>
            <p className="profile-dialog-copy">Нужен для поиска товаров в ближайших магазинах.</p>
            {authConfigured && authStatus !== "signedIn" && (
              <div className="profile-auth-panel">
                <label htmlFor="profile-email">Email</label>
                <div className="profile-inline-action">
                  <input
                    id="profile-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    type="email"
                  />
                  <button className="secondary-button" type="button" onClick={() => onSendOtp(email)}>Войти по email</button>
                </div>
                {authStatus === "linkSent" && <p className="profile-dialog-copy">Проверьте почту.</p>}
              </div>
            )}
            {authConfigured && authStatus === "signedIn" && (
              <p className="profile-dialog-copy">{profile.email ? `Вы вошли как ${profile.email}.` : "Вы вошли в профиль."}</p>
            )}
            {authError && <p className="profile-dialog-error" role="alert">{authError}</p>}
            <div className="profile-form-grid">
              <label htmlFor="profile-address">Адрес</label>
              <input
                id="profile-address"
                value={draft.address}
                onChange={(event) => saveField("address", event.target.value)}
                placeholder="Москва, улица, дом"
                autoFocus
              />
              <div className="profile-number-grid">
                <label htmlFor="profile-household">Людей</label>
                <label htmlFor="profile-days">Дней</label>
                <label htmlFor="profile-budget">Бюджет</label>
                <input
                  id="profile-household"
                  min={1}
                  max={12}
                  type="number"
                  value={draft.householdSize}
                  onChange={(event) => saveField("householdSize", Number(event.target.value))}
                />
                <input
                  id="profile-days"
                  min={1}
                  max={14}
                  type="number"
                  value={draft.defaultDays}
                  onChange={(event) => saveField("defaultDays", Number(event.target.value))}
                />
                <input
                  id="profile-budget"
                  min={100}
                  max={100000}
                  type="number"
                  value={draft.defaultBudgetRub ?? ""}
                  onChange={(event) => saveField("defaultBudgetRub", event.target.value ? Number(event.target.value) : null)}
                  placeholder="₽"
                />
              </div>
              <label htmlFor="profile-excluded">Ограничения</label>
              <input
                id="profile-excluded"
                value={draft.excludedIngredients.join(", ")}
                onChange={(event) => saveField("excludedIngredients", parseList(event.target.value))}
                placeholder="грибы, острое"
              />
              <label htmlFor="profile-preferences">Предпочтения</label>
              <input
                id="profile-preferences"
                value={draft.preferences.join(", ")}
                onChange={(event) => saveField("preferences", parseList(event.target.value))}
                placeholder="белок, меньше готовки"
              />
            </div>
            <div className="dialog-actions">
              <button className="primary-button" type="submit">Сохранить</button>
              {hasAddress && <button className="secondary-button" type="button" onClick={() => {
                onChange(DEFAULT_PROFILE);
                setOpen(false);
              }}>Очистить</button>}
              {authConfigured && authStatus === "signedIn" && <button className="secondary-button" type="button" onClick={() => onSignOut()}>Выйти</button>}
            </div>
          </form>
        </div>
      )}
    </>
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
  const chips = summarizeIntentSlots(intent);
  return (
    <div className="chips" aria-label="Параметры запроса">
      {chips.map((chip) => <span key={chip}>{chip}</span>)}
      {intent.assumptions.map((item) => <span key={item} className="assumption">{item}</span>)}
    </div>
  );
}

export function FullscreenLoader({ stage, intent, onCancel }: { stage: WorkflowStage; intent: Planner["state"]["intent"]; onCancel: () => void }) {
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
        {intent && (
          <div className="loader-slots" aria-label="Параметры запроса">
            {summarizeIntentSlots(intent).map((slot) => <span key={slot}>{slot}</span>)}
          </div>
        )}
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
        <button className="secondary-button" type="button" onClick={onCancel}>Отменить</button>
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
        <button type="submit" disabled={busy || !hasText} aria-label={hasText ? "Подобрать 3 корзины" : "Введите задачу для подбора"} aria-keyshortcuts="Control+Enter Meta+Enter">
          {busy ? <Loader2 className="spin" size={18} /> : <ShoppingBasket size={18} />}
          <span>{busy ? "Собираем..." : "Подобрать 3 корзины"}</span>
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
          variants={variants}
          mode={planner.state.catalogMode}
          creating={planner.state.stage === "creatingCart"}
          onItems={(items) => planner.updateItems(selected.id, items)}
          onReplace={(xmlId) => planner.replaceItem(selected.id, xmlId)}
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
            variants={variants}
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

export function BasketVariantCard({ variant, recommended, variants, onSelect }: { variant: BasketVariant; recommended: boolean; variants: BasketVariant[]; onSelect: () => void }) {
  const presentation = getVariantPresentation(variant, variants);

  return (
    <article className="variant-card vv-basket-variant-card" data-od-id={`variant-card-${variant.id}`}>
      <button className="variant-card-button" type="button" onClick={onSelect} aria-label={`Открыть корзину ${variant.title}`}>
        <div className="variant-card-top">
          <div>
            <h2>{presentation.title}</h2>
            <small>{presentation.subtitle}</small>
          </div>
          {recommended && presentation.recommendationLabel && <strong className="recommend-badge">{presentation.recommendationLabel}</strong>}
        </div>
        <strong className="price">{variant.totalRub.toLocaleString("ru-RU")} ₽</strong>
        <div className="variant-compare-line">
          <span>{presentation.coverageLabel}</span>
          <span>{presentation.cookingLabel}</span>
          <span>{presentation.priceDeltaLabel}</span>
        </div>
        <ul className="variant-preview-list" aria-label="В составе">
          {presentation.previewItems.map((name) => <li key={name}>{name}</li>)}
        </ul>
        <p className="variant-difference">{presentation.tradeoffText}</p>
        <span className="variant-card-action">Открыть</span>
      </button>
    </article>
  );
}

export function BasketItemRow({ item, onQuantity, onDelete, onReplace }: { item: BasketItem; onQuantity: (quantity: number) => void; onDelete: () => void; onReplace: () => void }) {
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
        <button type="button" className="secondary-button replace-button" onClick={onReplace}>Заменить</button>
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

export function SelectedBasketActions({ variant, variants, mode, creating, onItems, onReplace, onCreateCart }: { variant: BasketVariant; variants: BasketVariant[]; mode: "live" | "demo" | "connecting"; creating: boolean; onItems: (items: BasketItem[]) => void; onReplace: (xmlId: string) => void; onCreateCart: () => Promise<string | null> }) {
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState<BasketItem | null>(null);
  const presentation = getVariantPresentation(variant, variants);
  const list = useMemo(() => variant.items.map((item) => `${item.quantity} × ${item.name} — ${Math.round(item.priceRub * item.quantity)} ₽`).join("\n"), [variant.items]);
  const copy = () => void navigator.clipboard.writeText(list);
  const update = (xmlId: string, quantity: number) => onItems(variant.items.map((item) => item.xmlId === xmlId ? { ...item, quantity: Math.min(9, Math.max(1, quantity)) } : item));
  const remove = (item: BasketItem) => {
    setRemoved(item);
    onItems(variant.items.filter((current) => current.xmlId !== item.xmlId));
  };
  const undoRemove = () => {
    if (!removed) return;
    onItems([...variant.items, removed]);
    setRemoved(null);
  };

  return (
    <>
      <section className="selected-basket vv-selected-basket" data-od-id="selected-basket">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Выбранная корзина</p>
            <h2>{presentation.title}</h2>
            <p>{variant.totalRub.toLocaleString("ru-RU")} ₽ · {variant.uniqueItemsCount} позиций</p>
          </div>
          <button className="secondary-button" type="button" onClick={copy}><Copy size={17} /> Скопировать</button>
        </div>
        <div className="rows">
          {variant.items.map((item) => (
            <BasketItemRow
              key={item.xmlId}
              item={item}
              onQuantity={(quantity) => update(item.xmlId, quantity)}
              onDelete={() => remove(item)}
              onReplace={() => onReplace(item.xmlId)}
            />
          ))}
        </div>
        {removed && <button className="secondary-button undo-button" type="button" onClick={undoRemove}>Вернуть {removed.name}</button>}
        {variant.warnings.length > 0 && (
          <ul className="variant-warnings" aria-label="Предупреждения по корзине">
            {variant.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
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
        <button className="primary-button checkout-button" type="button" disabled>ВкусВилл недоступен</button>
      ) : cartUrl ? (
        <a className="primary-button checkout-button" href={cartUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Открыть во ВкусВилл</a>
      ) : (
        <button className="primary-button checkout-button" type="button" disabled={creating} onClick={onCreateCart}>
          {creating ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />} Открыть во ВкусВилл
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
