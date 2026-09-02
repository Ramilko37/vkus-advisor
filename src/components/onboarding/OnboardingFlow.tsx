import { Check, ChevronLeft, Loader2, MapPin, Minus, Plus, ShoppingBasket, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { useOnboarding } from "../../hooks/useOnboarding";
import { findLentaStores, reverseGeocodeAddress, suggestAddresses } from "../../services/catalog";
import { trackProductEvent } from "../../services/productAnalytics";
import { normalizeProfile } from "../../services/profileRepository";
import type { LentaStore, OnboardingStep, UserProfile } from "../../types/domain";
import "./onboarding-flow.css";

type OnboardingController = ReturnType<typeof useOnboarding>;

interface OnboardingFlowProps {
  onboarding: OnboardingController;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void | Promise<void>;
}

const steps: OnboardingStep[] = ["value", "delivery", "profile"];
const geoStatusCopy = {
  ready: "Адрес определён.",
  empty: "Не удалось найти адрес в этой точке — введите его вручную.",
  denied: "Доступ к геопозиции запрещён — введите адрес вручную.",
  unsupported: "Браузер не поддерживает геолокацию — введите адрес вручную.",
  error: "Не удалось определить адрес — попробуйте ещё раз или введите его вручную.",
};

export function OnboardingFlow({ onboarding, profile, onProfileChange }: OnboardingFlowProps) {
  const [draft, setDraft] = useState(() => normalizeProfile(profile));
  const shown = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;
  const stepIndex = steps.indexOf(onboarding.state.step);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    trackProductEvent(onboarding.state.status === "in_progress" ? "onboarding_resumed" : "onboarding_shown", {
      step: onboarding.state.step,
    });
  }, [onboarding.state.status, onboarding.state.step]);

  useEffect(() => {
    dialogRef.current?.scrollTo?.({ top: 0 });
    window.requestAnimationFrame(() => document.getElementById("onboarding-title")?.focus({ preventScroll: true }));
  }, [onboarding.state.step]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        trackProductEvent("onboarding_dismissed", { step: onboardingRef.current.state.step });
        onboardingRef.current.dismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => restoreFocusRef.current?.isConnected && restoreFocusRef.current.focus(), 0);
    };
  }, []);

  const saveDraft = async (next = draft) => {
    const normalized = normalizeProfile(next);
    setDraft(normalized);
    await onProfileChange(normalized);
  };

  return (
    <div ref={dialogRef} className="onboarding" role="dialog" aria-modal="true" aria-label="Первоначальная настройка">
      <div className="onboarding__frame">
        <header className="onboarding__header">
          {stepIndex > 0 ? (
            <button className="onboarding__icon-button" type="button" onClick={() => onboarding.back()} aria-label="Назад">
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : <span className="onboarding__header-spacer" />}
          <div className="onboarding__progress" aria-label={`Шаг ${stepIndex + 1} из ${steps.length}`} aria-live="polite">
            <span>Шаг {stepIndex + 1} из {steps.length}</span>
            <div aria-hidden="true">{steps.map((step, index) => <i key={step} className={index <= stepIndex ? "is-active" : ""} />)}</div>
          </div>
          <button className="onboarding__icon-button" type="button" onClick={() => {
            trackProductEvent("onboarding_dismissed", { step: onboarding.state.step });
            onboarding.dismiss();
          }} aria-label="Пропустить настройку">
            <X aria-hidden="true" />
          </button>
        </header>

        {onboarding.state.step === "value" && <ValueStep onStart={() => {
          trackProductEvent("onboarding_started");
          trackProductEvent("onboarding_value_completed");
          onboarding.start();
        }} />}
        {onboarding.state.step === "delivery" && (
          <DeliveryStep
            profile={draft}
            onChange={setDraft}
            onContinue={() => {
              void saveDraft();
              trackProductEvent("onboarding_address_entered", { has_lenta_store: Boolean(draft.lentaStoreId) });
              onboarding.goTo("profile");
            }}
          />
        )}
        {onboarding.state.step === "profile" && (
          <ProfileStep
            profile={draft}
            onChange={setDraft}
            onContinue={async () => {
              await saveDraft();
              trackProductEvent("onboarding_profile_completed", {
                household_size: draft.householdSize,
                restrictions_count: draft.excludedIngredients.length,
                preferences_count: draft.preferences.length,
              });
              onboarding.complete();
              trackProductEvent("onboarding_completed");
            }}
            onSkip={async () => {
              const next = normalizeProfile({ ...draft, householdSize: 1, excludedIngredients: [], preferences: [] });
              await saveDraft(next);
              trackProductEvent("onboarding_profile_skipped");
              onboarding.complete();
              trackProductEvent("onboarding_completed");
            }}
          />
        )}
      </div>
    </div>
  );
}

function ValueStep({ onStart }: { onStart: () => void }) {
  return (
    <section className="onboarding__content onboarding__value">
      <div className="onboarding__hero-mark" aria-hidden="true"><ShoppingBasket /></div>
      <h1 id="onboarding-title" tabIndex={-1}>Соберём покупки вместо вас</h1>
      <p className="onboarding__lead">Опишите, что вам нужно, обычным языком. Мы найдём реальные товары и цены и соберём несколько готовых вариантов корзины.</p>
      <ol className="onboarding__benefits">
        <li><b>1</b><span><strong>Укажите, где покупаете</strong><small>Адрес нужен, чтобы искать реальные товары и актуальный ассортимент.</small></span></li>
        <li><b>2</b><span><strong>Расскажите, что нужно</strong><small>Например: ужины на 3 дня для двоих до 3000 ₽, без грибов.</small></span></li>
        <li><b>3</b><span><strong>Выберите корзину</strong><small>Сравните варианты, измените состав и переходите к покупке.</small></span></li>
      </ol>
      <div className="onboarding__footer">
        <p>Без регистрации. Настройки можно изменить позже.</p>
        <button className="onboarding__primary" type="button" onClick={onStart}>Начать</button>
      </div>
    </section>
  );
}

function DeliveryStep({ profile, onChange, onContinue }: { profile: UserProfile; onChange: (profile: UserProfile) => void; onContinue: () => void }) {
  const [stores, setStores] = useState<LentaStore[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ready" | "empty" | "denied" | "unsupported" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const [addressTouched, setAddressTouched] = useState(false);
  const address = profile.address.trim();
  const validAddress = address.length >= 8 && /\d/.test(address);
  const profileRef = useRef(profile);
  const onChangeRef = useRef(onChange);
  const addressRef = useRef<HTMLInputElement>(null);
  const selectedAddressRef = useRef("");
  profileRef.current = profile;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (address.length < 3 || selectedAddressRef.current === profile.address) {
      selectedAddressRef.current = "";
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSuggestionStatus("loading");
      try {
        const next = await suggestAddresses(address, controller.signal);
        if (controller.signal.aborted) return;
        const values = Array.isArray(next) ? next : [];
        setSuggestions(values);
        setSuggestionsOpen(values.length > 0);
        setActiveSuggestion(-1);
        setSuggestionStatus("idle");
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSuggestionsOpen(false);
        setSuggestionStatus("error");
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [address, profile.address]);

  useEffect(() => {
    if (!validAddress) {
      setStatus("idle");
      setStores([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus("loading");
      trackProductEvent("onboarding_store_search_started");
      try {
        const nextStores = await findLentaStores(address, controller.signal);
        setStores(nextStores);
        setStatus(nextStores.length ? "ready" : "empty");
        if (nextStores.length) {
          onChangeRef.current(withStore(profileRef.current, nextStores[0]));
          trackProductEvent("onboarding_store_selected", { retailer: "lenta", automatic: true });
        }
      } catch {
        if (controller.signal.aborted) return;
        setStatus("error");
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [address, retry, validAddress]);

  const updateAddress = (value: string) => onChangeRef.current({
    ...profileRef.current,
    address: value,
    lentaStoreId: undefined,
    lentaStoreName: undefined,
    lentaStoreAddress: undefined,
  });

  const selectAddress = (value: string) => {
    selectedAddressRef.current = value;
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    updateAddress(value);
  };

  const handleAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestionsOpen(false);
      return;
    }
    if (!suggestions.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter")) return;
    event.preventDefault();
    if (event.key === "Enter") {
      selectAddress(suggestions[Math.max(activeSuggestion, 0)]);
      return;
    }
    setSuggestionsOpen(true);
    setActiveSuggestion((current) => event.key === "ArrowDown"
      ? (current + 1) % suggestions.length
      : (current <= 0 ? suggestions.length - 1 : current - 1));
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void reverseGeocodeAddress(coords.latitude, coords.longitude).then((next) => {
          if (!next.length) {
            setGeoStatus("empty");
            return;
          }
          selectAddress(next[0]);
          setGeoStatus("ready");
        }).catch(() => setGeoStatus("error"));
      },
      (error) => setGeoStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <section className="onboarding__content">
      <h1 id="onboarding-title" tabIndex={-1}>Где вы покупаете продукты?</h1>
      <p className="onboarding__lead">Адрес нужен, чтобы показывать реальные товары, цены и ассортимент рядом с вами.</p>
      <div className="onboarding__field onboarding__address-field">
        <label htmlFor="onboarding-address">Адрес</label>
        <div className="onboarding__address-control">
          <input
            id="onboarding-address"
            ref={addressRef}
            className="onboarding__address-input"
            value={profile.address}
            onBlur={() => {
              setAddressTouched(true);
              window.setTimeout(() => setSuggestionsOpen(false), 100);
            }}
            onChange={(event) => updateAddress(event.target.value)}
            onFocus={() => suggestions.length && setSuggestionsOpen(true)}
            onKeyDown={handleAddressKeyDown}
            placeholder="Москва, улица, дом"
            autoComplete="street-address"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen && suggestions.length > 0}
            aria-controls="onboarding-address-suggestions"
            aria-activedescendant={activeSuggestion >= 0 ? `onboarding-address-suggestion-${activeSuggestion}` : undefined}
            aria-invalid={addressTouched && !validAddress}
            aria-describedby={addressTouched && !validAddress ? "onboarding-address-error" : undefined}
          />
          {suggestionStatus === "loading" && <Loader2 className="onboarding__address-loader spin" aria-label="Ищем адреса" />}
          {suggestionsOpen && suggestions.length > 0 && (
            <ul id="onboarding-address-suggestions" className="onboarding__suggestions" role="listbox">
              {suggestions.map((suggestion, index) => (
                <li
                  id={`onboarding-address-suggestion-${index}`}
                  key={suggestion}
                  className={index === activeSuggestion ? "is-active" : ""}
                  role="option"
                  aria-selected={index === activeSuggestion}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectAddress(suggestion)}
                >
                  <MapPin aria-hidden="true" />
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="onboarding__detect-address" type="button" onClick={detectLocation} disabled={geoStatus === "loading"}>
          {geoStatus === "loading" ? <Loader2 className="spin" aria-hidden="true" /> : <MapPin aria-hidden="true" />}
          {geoStatus === "loading" ? "Определяем адрес…" : "Определить адрес автоматически"}
        </button>
        {suggestionStatus === "error" && <small role="status">Подсказки временно недоступны — адрес можно ввести вручную.</small>}
        {geoStatus !== "idle" && geoStatus !== "loading" && <small role="status">{geoStatusCopy[geoStatus]}</small>}
      </div>
      {addressTouched && !validAddress && <p id="onboarding-address-error" className="onboarding__field-error">Укажите улицу и номер дома.</p>}

      <div className="onboarding__store-status" aria-live="polite">
        {status === "loading" && <p>Ищем ближайшие магазины…</p>}
        {status === "empty" && <div className="onboarding__inline-state"><strong>Не нашли подходящий магазин для этого адреса</strong><span>Проверьте адрес или попробуйте другой.</span><button type="button" onClick={() => addressRef.current?.focus()}>Изменить адрес</button></div>}
        {status === "error" && <div className="onboarding__inline-state"><strong>Не удалось проверить магазины</strong><span>Повторите попытку.</span><div><button type="button" onClick={() => setRetry((value) => value + 1)}>Попробовать ещё раз</button><button type="button" onClick={() => addressRef.current?.focus()}>Изменить адрес</button></div></div>}
        {status === "ready" && stores.length === 1 && (
          <div className="onboarding__selected-store"><Check aria-hidden="true" /><span><strong>{storeLabel(stores[0])}</strong>{stores[0].distanceMeters ? <small>{formatDistance(stores[0].distanceMeters)} от указанного адреса</small> : null}</span><button type="button" onClick={() => addressRef.current?.focus()}>Изменить</button></div>
        )}
        {status === "ready" && stores.length > 1 && (
          <fieldset className="onboarding__store-list">
            <legend>Ближайший магазин выбран автоматически</legend>
            {stores.map((store) => (
              <label key={store.id}>
                <input type="radio" name="lenta-store" checked={profile.lentaStoreId === store.id} onChange={() => {
                  onChange(withStore(profile, store));
                  trackProductEvent("onboarding_store_selected", { retailer: "lenta", automatic: false });
                }} />
                <span>{storeLabel(store)}{store.distanceMeters ? <small>{formatDistance(store.distanceMeters)}</small> : null}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      <div className="onboarding__footer">
        <p>Подберём ближайшую Ленту по адресу. При необходимости магазин можно изменить.</p>
        <button
          className="onboarding__primary"
          type="button"
          disabled={!validAddress || status !== "ready" || !profile.lentaStoreId}
          onClick={onContinue}
        >
          Продолжить
        </button>
      </div>
    </section>
  );
}

function ProfileStep({ profile, onChange, onContinue, onSkip }: { profile: UserProfile; onChange: (profile: UserProfile) => void; onContinue: () => void; onSkip: () => void }) {
  return (
    <section className="onboarding__content">
      <h1 id="onboarding-title" tabIndex={-1}>Что учитывать в ваших корзинах?</h1>
      <p className="onboarding__lead">Эти настройки запомним и будем автоматически учитывать в следующих подборках.</p>

      <div className="onboarding__profile-block">
        <div className="onboarding__section-title"><span>Для скольких человек обычно покупаете?</span><strong>{peopleLabel(profile.householdSize)}</strong></div>
        <div className="onboarding__stepper">
          <button type="button" aria-label="Уменьшить количество людей" disabled={profile.householdSize <= 1} onClick={() => onChange({ ...profile, householdSize: profile.householdSize - 1 })}><Minus /></button>
          <output>{peopleLabel(profile.householdSize)}</output>
          <button type="button" aria-label="Увеличить количество людей" disabled={profile.householdSize >= 12} onClick={() => onChange({ ...profile, householdSize: profile.householdSize + 1 })}><Plus /></button>
        </div>
      </div>

      <TagEditor label="Что точно не покупать?" hint="Аллергии, продукты, которые не едите, или другие постоянные ограничения." placeholder="Например: грибы" values={profile.excludedIngredients} onChange={(values) => onChange({ ...profile, excludedIngredients: values })} />
      <TagEditor label="Что предпочитаете?" hint="Пожелания, которые стоит учитывать, если есть выбор." placeholder="Например: больше белка" values={profile.preferences} onChange={(values) => onChange({ ...profile, preferences: values })} />

      <aside className="onboarding__profile-explainer">
        <strong>Здесь только постоянные настройки.</strong>
        <span>Бюджет, количество дней, конкретные блюда и время на готовку можно менять в каждом новом запросе.</span>
      </aside>

      <div className="onboarding__footer onboarding__footer--split">
        <button className="onboarding__secondary" type="button" onClick={onSkip}>Пропустить</button>
        <button className="onboarding__primary" type="button" onClick={onContinue}>Сохранить</button>
      </div>
    </section>
  );
}

function TagEditor({ label, hint, placeholder, values, onChange }: { label: string; hint: string; placeholder: string; values: string[]; onChange: (values: string[]) => void }) {
  const [value, setValue] = useState("");
  const add = () => {
    const next = value.trim();
    if (!next || values.some((item) => item.toLocaleLowerCase("ru-RU") === next.toLocaleLowerCase("ru-RU"))) return;
    onChange([...values, next]);
    setValue("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };
  return (
    <div className="onboarding__profile-block">
      <label className="onboarding__field">
        <span>{label}</span>
        <small>{hint}</small>
        <div className="onboarding__tag-input">
          <input aria-label={label} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} />
          <button type="button" onClick={add} disabled={!value.trim()}>Добавить</button>
        </div>
      </label>
      {values.length > 0 && <div className="onboarding__tags">{values.map((item) => <button key={item} type="button" onClick={() => onChange(values.filter((value) => value !== item))}>{item}<X aria-label="Удалить" /></button>)}</div>}
    </div>
  );
}

function withStore(profile: UserProfile, store: LentaStore) {
  return normalizeProfile({
    ...profile,
    lentaStoreId: store.id,
    lentaStoreName: store.name || "Лента",
    lentaStoreAddress: store.address,
  });
}

function storeLabel(store: LentaStore) {
  return `${store.name || "Лента"}${store.address ? `, ${store.address}` : ""}`;
}

function formatDistance(value: number) {
  return value < 1000 ? `${Math.round(value)} м` : `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}

function peopleLabel(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? "человек" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "человека" : "человек";
  return `${value} ${noun}`;
}
