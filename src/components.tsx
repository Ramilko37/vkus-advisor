import { AlertTriangle, ChevronLeft, Copy, ExternalLink, Loader2, MapPin, Minus, Plus, RefreshCw, Search, ShoppingBasket, Trash2, User, X } from "lucide-react";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { BasketItem, BasketVariant, CheckoutResult, LentaStore, Retailer, RetailerResult, UserProfile, WorkflowStage } from "./types/domain";
import type { useBasketPlanner } from "./hooks/useBasketPlanner";
import type { AuthStatus } from "./hooks/useAuthProfile";
import { normalizeProfile } from "./services/profileRepository";
import { findLentaStores, suggestAddresses } from "./services/catalog";
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
  { title: "Ужины на 3 дня", prompt: "Ужины на 3 дня для двоих до 3000 ₽, без грибов" },
  { title: "Продукты на неделю", prompt: "Продукты на неделю для семьи" },
  { title: "Максимально бюджетно", prompt: "Собрать продукты максимально бюджетно" },
  { title: "Минимум готовки", prompt: "Продукты на несколько дней с минимумом готовки" },
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
  canceled: "Отменено",
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

type RetailerKey = NonNullable<BasketVariant["retailer"]>;

const retailerOrder: RetailerKey[] = ["vkusvill", "lenta", "pyaterochka", "demo"];
const retailerLabels: Record<RetailerKey, string> = {
  vkusvill: "ВкусВилл",
  lenta: "Лента",
  pyaterochka: "Пятёрочка",
  demo: "Демо",
};

function scrollToTop() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export function AppShell({ children, route, authProfile, onOpenAddress }: { children: ReactNode; route: "home" | "results"; authProfile: AuthProfile; onOpenAddress: () => void }) {
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
        onOpenAddress={onOpenAddress}
      />
      <Header route={route} address={authProfile.profile.address} onOpenAddress={onOpenAddress} />
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
  onOpenAddress,
}: {
  profile: UserProfile;
  authConfigured: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  onChange: (profile: UserProfile) => Promise<void> | void;
  onSendOtp: (email: string) => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onOpenAddress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UserProfile>(() => normalizeProfile(profile));
  const [email, setEmail] = useState(profile.email ?? "");
  const [tagInput, setTagInput] = useState({ excludedIngredients: "", preferences: "" });
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "denied" | "unavailable">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lentaStores, setLentaStores] = useState<LentaStore[]>([]);
  const [storeStatus, setStoreStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [addressSuggestionStatus, setAddressSuggestionStatus] = useState<"idle" | "loading" | "error">("idle");
  const [toast, setToast] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const selectedAddressRef = useRef("");
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
    let nextProfile = normalizeProfile(draft);
    if (nextProfile.address && nextProfile.address.length < 5) {
      setSaveStatus("error");
      setSaveError("Адрес выглядит слишком коротким. Укажите город, улицу и дом.");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      if (nextProfile.address && !nextProfile.lentaStoreId) {
        setStoreStatus("loading");
        const stores = await findLentaStores(nextProfile.address);
        const nearest = stores[0];
        setLentaStores(stores);
        if (!nearest) {
          setStoreStatus("empty");
          setSaveStatus("error");
          setSaveError("Не удалось подобрать магазин Ленты. Уточните адрес или повторите поиск.");
          return;
        }
        nextProfile = normalizeProfile({
          ...nextProfile,
          lentaStoreId: nearest.id,
          lentaStoreName: nearest.name,
          lentaStoreAddress: nearest.address,
        });
        setDraft(nextProfile);
        setStoreStatus("ready");
      }
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
  const changeAddress = (address: string) => {
    setDraft((current) => ({ ...current, address, lentaStoreId: undefined, lentaStoreName: undefined, lentaStoreAddress: undefined }));
    setLentaStores([]);
    setStoreStatus("idle");
    setSaveError(null);
  };
  const selectAddress = (address: string) => {
    selectedAddressRef.current = address;
    setAddressSuggestions([]);
    setAddressSuggestionsOpen(false);
    changeAddress(address);
  };
  const loadLentaStores = async () => {
    const address = normalizedDraft.address;
    if (address.length < 5) {
      setStoreStatus("error");
      setSaveError("Сначала укажите город, улицу и дом.");
      return;
    }
    setStoreStatus("loading");
    setSaveError(null);
    try {
      const stores = await findLentaStores(address);
      setLentaStores(stores);
      setStoreStatus(stores.length ? "ready" : "empty");
      if (stores[0]) selectLentaStore(stores[0]);
    } catch {
      setStoreStatus("error");
      setSaveError("Не удалось найти магазины Ленты. Проверьте адрес и повторите.");
    }
  };
  const selectLentaStore = (store: LentaStore) => {
    setDraft((current) => ({ ...current, lentaStoreId: store.id, lentaStoreName: store.name, lentaStoreAddress: store.address }));
    setSaveError(null);
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
      setLentaStores([]);
      setStoreStatus("idle");
      setAddressSuggestions([]);
      setAddressSuggestionsOpen(false);
      setAddressSuggestionStatus("idle");
    }
  }, [open, profile]);

  useEffect(() => {
    const query = draft.address.trim();
    if (!open || query.length < 3 || selectedAddressRef.current === draft.address) {
      selectedAddressRef.current = "";
      setAddressSuggestions([]);
      setAddressSuggestionsOpen(false);
      setAddressSuggestionStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddressSuggestionStatus("loading");
      try {
        const suggestions = await suggestAddresses(query, controller.signal);
        if (controller.signal.aborted) return;
        setAddressSuggestions(suggestions);
        setAddressSuggestionsOpen(suggestions.length > 0);
        setAddressSuggestionStatus("idle");
      } catch {
        if (controller.signal.aborted) return;
        setAddressSuggestions([]);
        setAddressSuggestionsOpen(false);
        setAddressSuggestionStatus("error");
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft.address, open]);

  return (
    <>
      <button ref={triggerRef} className={`profile-trigger liquid-glass ${hasAddress ? "has-address" : ""}`} type="button" onClick={() => setOpen(true)} aria-label="Открыть профиль">
        <User size={19} />
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
                {onOpenAddress ? (
                  <>
                    <div className="profile-selected-store">
                      <strong>{profile.address || "Адрес не указан"}</strong>
                      {profile.lentaStoreName && <span>{profile.lentaStoreName}</span>}
                    </div>
                    <button className="secondary-button profile-location-button" type="button" onClick={() => {
                      closeDialog();
                      onOpenAddress();
                    }}>Изменить адрес</button>
                  </>
                ) : (
                  <>
                <label htmlFor="profile-address">Адрес</label>
                <div className="profile-address-control">
                  <input
                    id="profile-address"
                    value={draft.address}
                    onChange={(event) => {
                      selectedAddressRef.current = "";
                      setAddressSuggestionsOpen(false);
                      changeAddress(event.target.value);
                    }}
                    onFocus={() => addressSuggestions.length && setAddressSuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setAddressSuggestionsOpen(false), 100)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && addressSuggestionsOpen) {
                        event.preventDefault();
                        event.stopPropagation();
                        setAddressSuggestionsOpen(false);
                      }
                    }}
                    placeholder="Москва, улица, дом"
                    autoComplete="street-address"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={addressSuggestionsOpen}
                    aria-controls="profile-address-suggestions"
                    autoFocus
                  />
                  {addressSuggestionStatus === "loading" && <Loader2 className="profile-address-loader spin" aria-label="Ищем адреса" />}
                  {addressSuggestionsOpen && (
                    <ul id="profile-address-suggestions" className="profile-address-suggestions" role="listbox">
                      {addressSuggestions.map((suggestion) => (
                        <li key={suggestion} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => selectAddress(suggestion)}>
                          <MapPin aria-hidden="true" />
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {addressSuggestionStatus === "error" && <p className="profile-dialog-copy" role="status">Подсказки временно недоступны — адрес можно ввести вручную.</p>}
                {draft.lentaStoreId && (
                  <div className="profile-selected-store">
                    <strong>{draft.lentaStoreName || "Магазин Ленты"}</strong>
                    {draft.lentaStoreAddress && <span>{draft.lentaStoreAddress}</span>}
                  </div>
                )}
                <button className="secondary-button profile-location-button" type="button" onClick={() => void loadLentaStores()} disabled={storeStatus === "loading" || normalizedDraft.address.length < 5}>
                  {storeStatus === "loading" ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
                  {storeStatus === "loading" ? "Ищем магазины..." : "Найти магазины Ленты"}
                </button>
                {storeStatus === "empty" && <p className="profile-dialog-copy" role="status">Для этого адреса магазины Ленты не найдены.</p>}
                {lentaStores.length > 0 && (
                  <fieldset className="lenta-store-list">
                    <legend>Выберите магазин Ленты</legend>
                    {lentaStores.map((store) => (
                      <label key={store.id} className="lenta-store-option">
                        <input type="radio" name="lenta-store" checked={draft.lentaStoreId === store.id} onChange={() => selectLentaStore(store)} />
                        <span>
                          <strong>{store.name || "Магазин Ленты"}</strong>
                          {store.address && <small>{store.address}</small>}
                          {typeof store.distanceMeters === "number" && <small>{formatDistance(store.distanceMeters)}</small>}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <button className="secondary-button profile-location-button" type="button" onClick={detectLocation} disabled={geoStatus === "loading"}>
                  {geoStatus === "loading" ? <Loader2 className="spin" size={17} /> : <MapPin size={17} />}
                  Определить автоматически
                </button>
                {geoStatus !== "idle" && <p className="profile-dialog-copy" role="status">{geoStatusCopy[geoStatus]}</p>}
                  </>
                )}
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

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1000 ? `${Math.round(distanceMeters)} м` : `${(distanceMeters / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}

function sameProfile(left: UserProfile, right: UserProfile) {
  return JSON.stringify(normalizeProfile(left)) === JSON.stringify(normalizeProfile(right));
}

export function Header({ route, address, onOpenAddress }: { route: "home" | "results"; address: string; onOpenAddress: () => void }) {
  if (route === "results") return null;

  return (
    <header className="header task-header" data-od-id="app-header">
      <button className="task-address" type="button" onClick={onOpenAddress} aria-label={`Адрес доставки: ${address}`}>
        <span className="task-address__location"><MapPin size={18} aria-hidden="true" /><strong>{shortAddress(address)}</strong></span>
        <span className="task-address__action">Изменить</span>
      </button>
    </header>
  );
}

function shortAddress(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts.find((part) => /^(ул|улица|пр-т|проспект|пер|переулок)(?:\s|$)/i.test(part));
  const house = parts.find((part) => /^(д|дом)(?:\s|$)/i.test(part));
  if (street) return [street.replace(/^(ул|улица|пр-т|проспект|пер|переулок)\s*/i, ""), house?.replace(/^(д|дом)\s*/i, "")].filter(Boolean).join(", ");
  return parts.slice(-2).join(", ") || "Указать адрес";
}

export function ConversationPanel({ planner, hasDeliveryAddress, retailers = [], onNeedsDelivery, draft, onDraftChange }: { planner: Planner; hasDeliveryAddress: boolean; retailers?: Retailer[]; onNeedsDelivery?: (request: string) => void; draft?: string; onDraftChange?: (request: string) => void }) {
  const [localText, setLocalText] = useState("");
  const text = draft ?? localText;
  const setText = (value: string | ((current: string) => string)) => {
    const next = typeof value === "function" ? value(text) : value;
    if (draft === undefined) setLocalText(next);
    onDraftChange?.(next);
  };
  const clarifying = planner.state.stage === "clarifying" && Boolean(planner.state.intent?.clarificationQuestion);
  const showMessages = !clarifying && (planner.state.messages.length > 1 || planner.state.stage === "error");
  const busy = ["analyzing", "searching", "composing", "creatingCart"].includes(planner.state.stage);
  const submit = (value = text) => {
    void planner.submit(value);
    setText("");
  };
  const editRequest = () => {
    setText(planner.state.pendingMessage ?? "");
    planner.editRequest();
    window.requestAnimationFrame(() => document.getElementById("basket-request")?.focus());
  };
  const errorAction = planner.state.error?.code === "retailer_unavailable" && onNeedsDelivery
    ? { label: "Выбрать другой магазин", run: () => onNeedsDelivery(planner.state.pendingMessage ?? text) }
    : planner.state.error && ["intent", "generation", "insufficient_products", "short_prompt"].includes(planner.state.error.code)
      ? { label: "Изменить запрос", run: editRequest }
      : { label: "Повторить", run: planner.retry };

  return (
    <section className="conversation-panel kit-home" aria-label="Подбор корзины" data-od-id="conversation-panel">
      {showMessages && <MessageList messages={planner.state.messages} />}
      {clarifying ? (
        <ClarificationStep
          question={planner.state.intent!.clarificationQuestion!}
          value={text}
          onChange={setText}
          onSubmit={submit}
        />
      ) : (
        <>
          <ChatComposer value={text} onChange={setText} onSubmit={() => submit()} busy={busy} hasDeliveryAddress={hasDeliveryAddress} onNeedsDelivery={onNeedsDelivery} />
          <PromptExamples onPick={setText} />
        </>
      )}
      <RetailerContext retailers={retailers} />
      <IntentChips intent={planner.state.intent} />
      {planner.state.error && <ErrorNotice message={planner.state.error.message} actionLabel={errorAction.label} onAction={errorAction.run} />}
      <CatalogStatus mode={planner.state.catalogMode} onReconnect={planner.reconnectCatalog} />
    </section>
  );
}

function ClarificationStep({ question, value, onChange, onSubmit }: { question: string; value: string; onChange: (value: string) => void; onSubmit: (value?: string) => void }) {
  const quickAnswers = clarificationAnswers(question);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <form className="clarification-step" onSubmit={handleSubmit}>
      <p className="section-kicker">Уточним один момент</p>
      <h1>{question}</h1>
      {quickAnswers.length > 0 && (
        <div className="clarification-answers" aria-label="Быстрые ответы">
          {quickAnswers.map((answer) => (
            <button key={answer.label} type="button" onClick={() => onSubmit(answer.value)}>{answer.label}</button>
          ))}
        </div>
      )}
      <label htmlFor="clarification-answer">Или ответьте своими словами</label>
      <textarea id="clarification-answer" rows={2} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Ваш ответ" />
      <button className="primary-button" type="submit" disabled={!value.trim()}>Продолжить</button>
    </form>
  );
}

function clarificationAnswers(question: string) {
  const normalized = question.toLocaleLowerCase("ru-RU");
  if (/человек|сколько.*(персон|людей)/.test(normalized)) {
    return [1, 2, 3, 4].map((people) => ({ label: people === 4 ? "4+" : String(people), value: `На ${people} человека` }));
  }
  if (/бюджет|сумм/.test(normalized)) {
    return [1500, 3000, 5000].map((budget) => ({ label: `${budget.toLocaleString("ru-RU")} ₽`, value: `До ${budget} ₽` }));
  }
  return [];
}

function RetailerContext({ retailers }: { retailers: Retailer[] }) {
  const available = retailers.filter((retailer) => retailer !== "demo");
  if (!available.length) return null;
  return (
    <section className="home-retailers" aria-labelledby="home-retailers-title">
      <h2 id="home-retailers-title">Магазины рядом</h2>
      <div>{available.map((retailer) => <span key={retailer}>{retailerLabels[retailer]}</span>)}</div>
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

export function PromptExamples({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="examples" aria-label="Готовые задачи">
      {examples.map((example) => (
        <button key={example.prompt} type="button" onClick={() => onPick(example.prompt)}>
          <span>{example.title}</span>
        </button>
      ))}
    </div>
  );
}

export function ChatComposer({ value, onChange, onSubmit, busy, hasDeliveryAddress, onNeedsDelivery }: { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean; hasDeliveryAddress: boolean; onNeedsDelivery?: (request: string) => void }) {
  const hasText = value.trim().length > 0;
  const canSubmit = hasText && !busy;
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (hasDeliveryAddress) onSubmit();
    else onNeedsDelivery?.(value.trim());
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmit) {
      event.preventDefault();
      if (hasDeliveryAddress) onSubmit();
      else onNeedsDelivery?.(value.trim());
    }
  };
  return (
    <form className="composer vv-chat-composer liquid-glass" onSubmit={handleSubmit}>
      <div className="composer-head">
        <h1>Что собрать?</h1>
        <p id="basket-request-hint">{hasDeliveryAddress ? "Опишите задачу обычными словами." : "Введите запрос — адрес добавим на следующем шаге."}</p>
      </div>
      <div className="composer-input-shell">
        <label className="sr-only" htmlFor="basket-request">Что собрать?</label>
        <textarea
          id="basket-request"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Например, ужины на 3 дня для двоих до 3000 ₽ без грибов"
          rows={5}
          aria-describedby="basket-request-hint"
        />
        <button type="submit" disabled={!canSubmit} aria-keyshortcuts="Control+Enter Meta+Enter">
          {busy ? <Loader2 className="spin" size={18} /> : <ShoppingBasket size={18} />}
          <span>{busy ? "Собираем..." : hasDeliveryAddress ? "Подобрать 3 варианта" : "Продолжить"}</span>
        </button>
      </div>
    </form>
  );
}

export function BasketResults({ planner, deliveryAddress = "", showResultsHint = false, showBasketEditHint = false, onDismissResultsHint, onDismissBasketEditHint, onVariantOpen, onBasketEdit, onCheckoutClick, onStartNewSearch, onEditRequest }: { planner: Planner; deliveryAddress?: string; showResultsHint?: boolean; showBasketEditHint?: boolean; onDismissResultsHint?: () => void; onDismissBasketEditHint?: () => void; onVariantOpen?: (retailer?: string) => void; onBasketEdit?: (retailer?: string) => void; onCheckoutClick?: (retailer?: string) => void; onStartNewSearch?: () => void; onEditRequest?: () => void }) {
  const [openedId, setOpenedId] = useState<string | null>(planner.state.selectedId);
  const [activeRetailer, setActiveRetailer] = useState<RetailerKey>(() => defaultRetailerKey(groupBasketVariants(planner.state.variants, planner.state.retailerResults)));
  const variants = planner.state.variants;
  const retailerGroups = useMemo(() => groupBasketVariants(variants, planner.state.retailerResults), [planner.state.retailerResults, variants]);
  const availableGroups = retailerGroups.filter((group) => group.variants.length > 0);
  const unavailableGroups = retailerGroups.filter((group) => group.variants.length === 0);
  const activeGroup = availableGroups.find((group) => group.key === activeRetailer) ?? availableGroups[0];
  const activeVariants = activeGroup?.variants ?? variants;
  const storeAddress = activeVariants.flatMap((variant) => variant.items).find((item) => item.storeAddress)?.storeAddress ?? deliveryAddress;
  const selected = planner.state.variants.find((variant) => variant.id === openedId) ?? null;
  const openVariant = (id: string) => {
    const variant = planner.state.variants.find((item) => item.id === id);
    onVariantOpen?.(variant?.retailer);
    planner.selectVariant(id);
    setOpenedId(id);
    scrollToTop();
  };

  useEffect(() => {
    if (planner.state.selectedId && !openedId) setOpenedId(planner.state.selectedId);
  }, [openedId, planner.state.selectedId]);

  useEffect(() => {
    if (availableGroups.length > 0 && !availableGroups.some((group) => group.key === activeRetailer)) {
      setActiveRetailer(availableGroups[0].key);
    }
  }, [activeRetailer, availableGroups]);

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
        {showBasketEditHint && <ContextHint onDismiss={onDismissBasketEditHint}>
          <strong>Корзина не фиксированная.</strong> Любой товар можно изменить перед покупкой.
        </ContextHint>}
        <SelectedBasketActions
          variant={selected}
          mode={planner.state.catalogMode}
          creating={planner.state.stage === "creatingCart"}
          onItems={(items) => { onBasketEdit?.(selected.retailer); planner.updateItems(selected.id, items); }}
          onReplace={(xmlId) => { onBasketEdit?.(selected.retailer); planner.replaceItem(selected.id, xmlId); }}
          onCreateCart={planner.createCart}
          onCheckoutClick={() => onCheckoutClick?.(selected.retailer)}
        />
      </section>
    );
  }

  return (
    <section className="results-panel kit-results" aria-label="Варианты корзины" data-od-id="results-panel">
      <header className="compare-header">
        <a className="section-kicker results-home-link" href="/" aria-label="На главную" onClick={onStartNewSearch ? (event) => { event.preventDefault(); onStartNewSearch(); } : undefined}>
          <ChevronLeft size={16} aria-hidden="true" />
          На главную
        </a>
        <div className="compare-request">
          <p className="section-kicker">Ваш запрос</p>
          <h1>{planner.state.intent?.originalRequest ?? "Три варианта корзины"}</h1>
          {planner.state.intent && <p className="compare-request-summary">{summarizeIntentSlots(planner.state.intent).join(" · ")}</p>}
          {activeGroup && <p className="compare-store-context"><MapPin size={16} aria-hidden="true" /> {retailerLabels[activeGroup.key]}{storeAddress ? ` · ${storeAddress}` : ""}</p>}
        </div>
        {onEditRequest && <button className="secondary-button compare-edit-request" type="button" onClick={onEditRequest}>Изменить запрос</button>}
      </header>
      {showResultsHint && <ContextHint onDismiss={onDismissResultsHint}>
        <strong>Готово. Мы собрали несколько способов решить вашу задачу.</strong> У вариантов разные приоритеты: цена, баланс состава и минимум готовки. Откройте любую корзину, чтобы посмотреть товары и изменить состав.
      </ContextHint>}
      {planner.state.catalogMode === "demo" && <DemoModeBanner onReconnect={planner.reconnectCatalog} />}
      {retailerGroups.length > 1 && (
        <div className="retailer-tabs" role="tablist" aria-label="Магазин">
          {retailerGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={group.key === activeGroup?.key}
              aria-disabled={group.variants.length === 0}
              disabled={group.variants.length === 0}
              onClick={() => setActiveRetailer(group.key)}
            >
              {retailerLabels[group.key]}
              <span>{group.variants.length || "Недоступно"}</span>
            </button>
          ))}
        </div>
      )}
      {unavailableGroups.length > 0 && (
        <div className="retailer-unavailable-list" aria-label="Недоступные магазины">
          {unavailableGroups.map((group) => <p key={group.key}>{retailerLabels[group.key]}: {group.result?.message ?? "сейчас недостаточно товаров для трёх вариантов"}</p>)}
        </div>
      )}
      <div className="variant-list compare-list" data-od-id="variant-grid">
        {activeVariants.length > 0 ? activeVariants.map((variant) => (
          <BasketVariantCard
            key={variant.id}
            variant={variant}
            onSelect={() => openVariant(variant.id)}
          />
        )) : (
          <RetailerEmptyState group={activeGroup} />
        )}
      </div>
    </section>
  );
}

function ContextHint({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <aside className="onboarding-context-hint" aria-label="Подсказка">
      <p>{children}</p>
      <button type="button" onClick={onDismiss}>Понятно</button>
    </aside>
  );
}

function RetailerEmptyState({ group }: { group?: { key: RetailerKey; result?: RetailerResult } }) {
  const label = group ? retailerLabels[group.key] : "магазина";
  const message = group?.result?.message ?? `Пока нет корзин для ${label}`;
  return (
    <div className="retailer-empty-state" role="status">
      <p>{message}</p>
      {group?.result && <span>Кандидатов: {group.result.candidateCount}</span>}
    </div>
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

function getRetailerKey(variant: Pick<BasketVariant, "retailer">): RetailerKey {
  return variant.retailer ?? "demo";
}

function groupBasketVariants(variants: BasketVariant[], retailerResults: RetailerResult[] = []): Array<{ key: RetailerKey; variants: BasketVariant[]; result?: RetailerResult }> {
  const grouped = new Map<RetailerKey, BasketVariant[]>();
  variants.forEach((variant) => {
    const key = getRetailerKey(variant);
    grouped.set(key, [...(grouped.get(key) ?? []), variant]);
  });
  const resultMap = new Map(retailerResults.map((result) => [result.retailer, result]));
  const hasRetailers = retailerResults.some((result) => result.retailer !== "demo") || variants.some((variant) => variant.retailer && variant.retailer !== "demo");
  const order = hasRetailers ? retailerOrder.filter((key) => key !== "demo") : retailerOrder;
  return order.flatMap((key) => {
    const group = grouped.get(key);
    const result = resultMap.get(key);
    return group || result ? [{ key, variants: group ?? [], result }] : [];
  });
}

function defaultRetailerKey(groups: Array<{ key: RetailerKey; variants: BasketVariant[] }>): RetailerKey {
  return groups.find((group) => group.variants.length > 0)?.key ?? groups[0]?.key ?? "demo";
}

export function BasketVariantCard({ variant, onSelect }: { variant: BasketVariant; onSelect: () => void }) {
  const presentation = getVariantPresentation(variant);
  const selectionLabel = variant.strategy === "economy" ? "Выбрать экономную" : variant.strategy === "fast" ? "Выбрать быструю" : "Выбрать сбалансированную";

  return (
    <article className="variant-card vv-basket-variant-card" data-od-id={`variant-card-${variant.id}`}>
      <button className="variant-card-button" type="button" onClick={onSelect} aria-label={selectionLabel}>
        <div className="variant-card-top">
          <div>
            <h2>{presentation.title}</h2>
            <small>{presentation.subtitle}</small>
          </div>
          {presentation.recommendationLabel && <strong className="recommend-badge">{presentation.recommendationLabel}</strong>}
        </div>
        <strong className="price">{variant.totalRub.toLocaleString("ru-RU")} ₽</strong>
        <div className="variant-compare-line">
          <span>{presentation.coverageLabel}</span>
          <span>{presentation.cookingLabel}</span>
          <span>{presentation.priceDeltaLabel}</span>
        </div>
        <p className="variant-difference">{presentation.tradeoffText}</p>
        <ul className="variant-preview-list" aria-label="Примеры товаров">
          {presentation.previewItems.map((name) => <li key={name}>{name}</li>)}
        </ul>
        <span className="variant-card-action">{selectionLabel}</span>
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
        {item.retailer === "lenta" && item.storeName && <span>Лента · {item.storeName}{item.storeAddress ? `, ${item.storeAddress}` : ""}</span>}
        <span>{item.weightLabel ?? roleLabels[item.role] ?? "Продукт"}</span>
        {item.priceObservedAt && <span>Цена проверена: {formatObservedAt(item.priceObservedAt)}</span>}
        {item.availability === "unavailable" && <span>Нет в наличии</span>}
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

function formatObservedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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

export function SelectedBasketActions({ variant, mode, creating, onItems, onReplace, onCreateCart, onCheckoutClick }: { variant: BasketVariant; mode: "live" | "demo" | "connecting"; creating: boolean; onItems: (items: BasketItem[]) => void; onReplace: (xmlId: string) => void; onCreateCart: () => Promise<CheckoutResult | null>; onCheckoutClick?: () => void }) {
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const [lentaCopyStatus, setLentaCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [removed, setRemoved] = useState<BasketItem | null>(null);
  const presentation = getVariantPresentation(variant);
  const retailer = variant.retailer ?? variant.items[0]?.retailer;
  const isLenta = retailer === "lenta";
  const list = useMemo(() => formatBasketList(variant.items), [variant.items]);
  const copy = () => void navigator.clipboard.writeText(list);
  const checkout = async () => {
    onCheckoutClick?.();
    const result = await onCreateCart();
    if (!result) return;
    if (isLenta) {
      try {
        await navigator.clipboard.writeText(formatBasketList(result.items ?? variant.items));
        setLentaCopyStatus("copied");
      } catch {
        setLentaCopyStatus("failed");
      }
    }
    setCartUrl(result.url);
  };
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
            <p className="section-kicker">Checkout</p>
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
        {isLenta && lentaCopyStatus !== "idle" && (
          <p className="demo-note" role="status">
            {lentaCopyStatus === "copied" ? "Список проверен и скопирован. В Ленте добавьте товары вручную." : "Список проверен. Скопируйте его кнопкой выше и добавьте товары в Ленте вручную."}
          </p>
        )}
        {mode === "demo" && <p className="demo-note">Это пример корзины: цены и товары нужны для ориентира. Список можно скопировать.</p>}
      </section>
      <CheckoutBar
        totalRub={variant.totalRub}
        itemCount={variant.uniqueItemsCount}
        mode={mode}
        creating={creating}
        cartUrl={cartUrl}
        retailer={retailer}
        onCreateCart={checkout}
      />
    </>
  );
}

function CheckoutBar({ totalRub, itemCount, mode, creating, cartUrl, retailer, onCreateCart }: { totalRub: number; itemCount: number; mode: "live" | "demo" | "connecting"; creating: boolean; cartUrl: string | null; retailer?: BasketVariant["retailer"]; onCreateCart: () => Promise<void> }) {
  const label = `${totalRub.toLocaleString("ru-RU")} ₽`;
  const isLenta = retailer === "lenta";

  return (
    <div className="checkout-bar vv-checkout-bar liquid-glass">
      <div>
        <strong>{label}</strong>
        <span>{itemCount} позиций</span>
      </div>
      {mode === "demo" ? (
        <button className="primary-button checkout-button" type="button" disabled>{isLenta ? "Лента недоступна" : "ВкусВилл недоступен"}</button>
      ) : cartUrl ? (
        <a className="primary-button checkout-button" href={cartUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> {isLenta ? "Открыть Ленту" : "Открыть во ВкусВилл"}</a>
      ) : (
        <button className="primary-button checkout-button" type="button" disabled={creating} onClick={onCreateCart}>
          {creating ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />} {isLenta ? "Проверить список Ленты" : "Открыть во ВкусВилл"}
        </button>
      )}
    </div>
  );
}

function formatBasketList(items: BasketItem[]) {
  return items.map((item) => `${item.quantity} × ${item.name} — ${Math.round(item.priceRub * item.quantity)} ₽`).join("\n");
}

export function ErrorNotice({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="error-notice" aria-live="polite">
      <AlertTriangle size={18} />
      <span>{message}</span>
      <button type="button" onClick={onAction}><RefreshCw size={16} /> {actionLabel}</button>
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
