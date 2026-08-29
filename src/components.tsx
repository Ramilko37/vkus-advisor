import { AlertTriangle, ChevronLeft, Copy, ExternalLink, Loader2, MapPin, Minus, Plus, RefreshCw, ShoppingBasket, Trash2, User, X } from "lucide-react";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { BasketItem, BasketVariant, UserProfile, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";
import type { AuthStatus } from "./hooks/useAuthProfile";
import { normalizeProfile } from "./services/profileRepository";
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
  updateProfile: (profile: UserProfile) => Promise<void> | void;
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
  onChange: (profile: UserProfile) => Promise<void> | void;
  onSendOtp: (email: string) => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserProfile>(() => normalizeProfile(profile));
  const [email, setEmail] = useState(profile.email ?? "");
  const [tagInput, setTagInput] = useState({ excludedIngredients: "", preferences: "" });
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "denied" | "unavailable">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const hasAddress = profile.address.length > 0;
  const normalizedDraft = useMemo(() => normalizeProfile(draft), [draft]);
  const normalizedProfile = useMemo(() => normalizeProfile(profile), [profile]);
  const dirty = useMemo(() => !sameProfile(normalizedDraft, normalizedProfile), [normalizedDraft, normalizedProfile]);

  const closeDialog = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const nextProfile = normalizeProfile(draft);
    if (nextProfile.address && nextProfile.address.length < 5) {
      setSaveStatus("error");
      setSaveError("Адрес выглядит слишком коротким. Укажите город, улицу и дом.");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await onChange(nextProfile);
      setSaveStatus("saved");
      setToast("Профиль сохранён");
      closeDialog();
      window.setTimeout(() => setToast(null), 1800);
    } catch {
      setSaveStatus("error");
      setSaveError("Не удалось сохранить профиль. Попробуйте ещё раз.");
    }
  };
  const saveField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setHousehold = (value: number) => saveField("householdSize", Math.min(12, Math.max(1, value)));
  const addTag = (key: "excludedIngredients" | "preferences") => {
    const value = tagInput[key].trim();
    if (!value || draft[key].some((item) => item.toLocaleLowerCase("ru-RU") === value.toLocaleLowerCase("ru-RU"))) return;
    saveField(key, [...draft[key], value]);
    setTagInput((current) => ({ ...current, [key]: "" }));
  };
  const removeTag = (key: "excludedIngredients" | "preferences", value: string) => {
    saveField(key, draft[key].filter((item) => item !== value));
  };
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      () => setGeoStatus("success"),
      (error) => setGeoStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 },
    );
  };
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    if (open) {
      setDraft(normalizeProfile(profile));
      setEmail(profile.email ?? "");
      setTagInput({ excludedIngredients: "", preferences: "" });
      setGeoStatus("idle");
      setSaveStatus("idle");
      setSaveError(null);
    }
  }, [open, profile]);

  return (
    <>
      <button ref={triggerRef} className={`profile-trigger liquid-glass ${hasAddress ? "has-address" : ""}`} type="button" onClick={() => setOpen(true)} aria-label={hasAddress ? `Адрес: ${profile.address}` : "Добавить адрес"}>
        {hasAddress ? <MapPin size={19} /> : <User size={19} />}
      </button>
      {toast && <div className="profile-toast" role="status">{toast}</div>}
      {open && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
          <form ref={dialogRef} className="dialog profile-dialog liquid-glass" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={handleDialogKeyDown}>
            <header className="profile-sheet-header">
              <div>
                <p className="section-kicker">Профиль</p>
                <h2 id="profile-title">Профиль</h2>
                <p className="profile-dialog-copy">Настройки, которые будем учитывать в следующих подборках.</p>
              </div>
              <button className="close-button" type="button" onClick={closeDialog} aria-label="Закрыть профиль"><X size={18} /></button>
            </header>
            <div className="profile-sheet-content">
              <section className="profile-section" aria-labelledby="profile-account-title">
                <div className="profile-section-heading">
                  <h3 id="profile-account-title">Аккаунт</h3>
                  {authConfigured && authStatus === "signedIn" && <button className="link-button profile-signout" type="button" onClick={() => onSignOut()}>Выйти</button>}
                </div>
                {authConfigured && authStatus !== "signedIn" ? (
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
                ) : (
                  <p className="profile-dialog-copy">{authConfigured ? (profile.email ?? "Вы вошли в профиль.") : "Гостевой профиль на этом устройстве."}</p>
                )}
              </section>
              <section className="profile-section" aria-labelledby="profile-address-title">
                <h3 id="profile-address-title">Адрес доставки</h3>
                <p className="profile-dialog-copy">Нужен для поиска товаров в ближайших магазинах.</p>
                <label htmlFor="profile-address">Адрес</label>
                <input
                  id="profile-address"
                  value={draft.address}
                  onChange={(event) => saveField("address", event.target.value)}
                  placeholder="Москва, улица, дом"
                  autoComplete="street-address"
                  autoFocus
                />
                <button className="secondary-button profile-location-button" type="button" onClick={detectLocation} disabled={geoStatus === "loading"}>
                  {geoStatus === "loading" ? <Loader2 className="spin" size={17} /> : <MapPin size={17} />}
                  Определить автоматически
                </button>
                {geoStatus !== "idle" && <p className="profile-dialog-copy" role="status">{geoStatusCopy[geoStatus]}</p>}
              </section>
              <section className="profile-section" aria-labelledby="profile-household-title">
                <div className="profile-section-heading">
                  <h3 id="profile-household-title">Домохозяйство</h3>
                  <span>{peopleLabel(draft.householdSize)}</span>
                </div>
                <div className="household-stepper" role="group" aria-label="Количество людей">
                  <button type="button" onClick={() => setHousehold(draft.householdSize - 1)} disabled={draft.householdSize <= 1} aria-label="Уменьшить количество людей"><Minus size={18} /></button>
                  <output>{peopleLabel(draft.householdSize)}</output>
                  <button type="button" onClick={() => setHousehold(draft.householdSize + 1)} disabled={draft.householdSize >= 12} aria-label="Увеличить количество людей"><Plus size={18} /></button>
                </div>
              </section>
              <TagEditor
                title="Ограничения"
                description="То, что лучше не добавлять в будущие корзины."
                items={draft.excludedIngredients}
                inputValue={tagInput.excludedIngredients}
                addButtonLabel="Добавить ограничение"
                inputLabel="Новое ограничение"
                placeholder="грибы"
                removeLabel={(tag) => `Удалить ограничение ${tag}`}
                onInput={(value) => setTagInput((current) => ({ ...current, excludedIngredients: value }))}
                onAdd={() => addTag("excludedIngredients")}
                onRemove={(tag) => removeTag("excludedIngredients", tag)}
              />
              <TagEditor
                title="Предпочтения"
                description="Мягкие пожелания для следующих подборок."
                items={draft.preferences}
                inputValue={tagInput.preferences}
                addButtonLabel="Добавить предпочтение"
                inputLabel="Новое предпочтение"
                placeholder="больше белка"
                removeLabel={(tag) => `Удалить предпочтение ${tag}`}
                onInput={(value) => setTagInput((current) => ({ ...current, preferences: value }))}
                onAdd={() => addTag("preferences")}
                onRemove={(tag) => removeTag("preferences", tag)}
              />
              {(authError || saveError) && <p className="profile-dialog-error" role="alert">{saveError ?? authError}</p>}
            </div>
            <footer className="profile-save-bar">
              <button className="primary-button full" type="submit" disabled={!dirty || saveStatus === "saving"}>{saveStatus === "saving" ? "Сохраняем..." : "Сохранить изменения"}</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

function TagEditor({
  title,
  description,
  items,
  inputValue,
  addButtonLabel,
  inputLabel,
  placeholder,
  removeLabel,
  onInput,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  items: string[];
  inputValue: string;
  addButtonLabel: string;
  inputLabel: string;
  placeholder: string;
  removeLabel: (tag: string) => string;
  onInput: (value: string) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const inputId = `${title.toLocaleLowerCase("ru-RU")}-input`;

  return (
    <section className="profile-section tag-editor" aria-labelledby={`${inputId}-title`}>
      <div className="profile-section-heading">
        <div>
          <h3 id={`${inputId}-title`}>{title}</h3>
          <p className="profile-dialog-copy">{description}</p>
        </div>
        {!adding && <button className="link-button" type="button" onClick={() => setAdding(true)}>{addButtonLabel}</button>}
      </div>
      <div className="profile-tags">
        {items.map((item) => (
          <span className="profile-tag" key={item}>
            {item}
            <button type="button" onClick={() => onRemove(item)} aria-label={removeLabel(item)}><X size={14} /></button>
          </span>
        ))}
        {items.length === 0 && <span className="profile-empty-tags">Пока пусто</span>}
      </div>
      {adding && (
        <div className="tag-input-row">
          <label className="sr-only" htmlFor={inputId}>{inputLabel}</label>
          <input
            id={inputId}
            value={inputValue}
            onChange={(event) => onInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAdd();
              }
            }}
            placeholder={placeholder}
            autoFocus
          />
          <button className="secondary-button" type="button" onClick={onAdd}>Добавить</button>
        </div>
      )}
    </section>
  );
}

const geoStatusCopy = {
  idle: "",
  loading: "Определяем геопозицию...",
  success: "Геопозиция получена. Адрес всё равно лучше уточнить вручную.",
  denied: "Нет доступа к геопозиции. Введите адрес вручную.",
  unavailable: "Не удалось определить геопозицию. Введите адрес вручную.",
};

function peopleLabel(value: number) {
  const count = Math.min(12, Math.max(1, Math.round(value)));
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} человек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} человека`;
  return `${count} человек`;
}

function sameProfile(left: UserProfile, right: UserProfile) {
  return JSON.stringify(normalizeProfile(left)) === JSON.stringify(normalizeProfile(right));
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
