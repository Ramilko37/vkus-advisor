import { Check, ChevronLeft, Loader2, MapPin, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { PixelBasketMark } from "../brand/PixelBasketMark";
import type { useOnboarding } from "../../hooks/useOnboarding";
import { findLentaStores, reverseGeocodeAddress, suggestAddresses } from "../../services/catalog";
import { normalizeProfile } from "../../services/profileRepository";
import type { LentaStore, UserProfile } from "../../types/domain";
import "./onboarding-flow.css";

type OnboardingController = ReturnType<typeof useOnboarding>;

interface OnboardingFlowProps {
  onboarding: OnboardingController;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void | Promise<void>;
  onDeliveryComplete: (profile: UserProfile, requestDraft: string) => void | Promise<void>;
}

const geoStatusCopy = {
  ready: "Адрес определён.",
  empty: "Не удалось найти адрес в этой точке — введите его вручную.",
  denied: "Доступ к геопозиции запрещён — введите адрес вручную.",
  unsupported: "Браузер не поддерживает геолокацию — введите адрес вручную.",
  error: "Не удалось определить адрес — попробуйте ещё раз или введите его вручную.",
};

export function OnboardingFlow({ onboarding, profile, onProfileChange, onDeliveryComplete }: OnboardingFlowProps) {
  const [draft, setDraft] = useState(() => normalizeProfile(profile));
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;

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

  return (
    <div ref={dialogRef} className="onboarding" role="dialog" aria-modal="true" aria-label="Первоначальная настройка">
      <div className="onboarding__frame">
        <header className="onboarding__header">
          {onboarding.state.step === "delivery" ? (
            <button className="onboarding__icon-button" type="button" onClick={onboarding.dismiss} aria-label="Назад">
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : <span className="onboarding__header-spacer" />}
          <span className="onboarding__brand">Умная корзина</span>
          <button className="onboarding__icon-button" type="button" onClick={onboarding.dismiss} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>

        {onboarding.state.step === "value" ? (
          <ValueStep onContinue={onboarding.finishIntro} />
        ) : (
          <DeliveryStep
            profile={draft}
            requestDraft={onboarding.state.requestDraft}
            onChange={setDraft}
            onContinue={async (nextProfile) => {
              await onProfileChange(nextProfile);
              onboarding.completeDelivery();
              await onDeliveryComplete(nextProfile, onboarding.state.requestDraft);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ValueStep({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="onboarding__content onboarding__value">
      <div className="onboarding__pixel-hero" aria-hidden="true">
        <PixelBasketMark size={112} />
      </div>
      <h1 id="onboarding-title" tabIndex={-1}>Соберём покупки вместо вас</h1>
      <p className="onboarding__lead">Опишите задачу обычным языком. Мы найдём реальные товары и предложим три корзины по цене и удобству.</p>
      <div className="onboarding__footer">
        <p>Без регистрации. Адрес спросим только перед поиском товаров.</p>
        <button className="onboarding__primary" type="button" onClick={onContinue}>Попробовать</button>
      </div>
    </section>
  );
}

function DeliveryStep({
  profile,
  requestDraft,
  onChange,
  onContinue,
}: {
  profile: UserProfile;
  requestDraft: string;
  onChange: (profile: UserProfile) => void;
  onContinue: (profile: UserProfile) => void | Promise<void>;
}) {
  const [stores, setStores] = useState<LentaStore[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ready" | "empty" | "denied" | "unsupported" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const [addressTouched, setAddressTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      try {
        const nextStores = await findLentaStores(address, controller.signal);
        if (controller.signal.aborted) return;
        setStores(nextStores);
        setStatus(nextStores.length ? "ready" : "empty");
        if (nextStores.length) onChangeRef.current(withStore(profileRef.current, nextStores[0]));
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

  const complete = async () => {
    const next = normalizeProfile(profile);
    setSubmitting(true);
    try {
      await onContinue(next);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="onboarding__content onboarding__delivery">
      <h1 id="onboarding-title" tabIndex={-1}>Куда доставить продукты?</h1>
      <p className="onboarding__lead">
        {requestDraft
          ? "По адресу найдём доступные товары и цены. Ваш запрос уже сохранён."
          : "По адресу найдём доступные товары, цены и магазины рядом."}
      </p>
      {requestDraft && <p className="onboarding__request-preview">{requestDraft}</p>}

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
        {status === "loading" && <p>Проверяем ближайшую Ленту…</p>}
        {status === "empty" && <div className="onboarding__inline-state"><strong>Не нашли ближайшую Ленту</strong><span>Адрес всё равно сохраним и проверим другие доступные магазины.</span><button type="button" onClick={() => addressRef.current?.focus()}>Изменить адрес</button></div>}
        {status === "error" && <div className="onboarding__inline-state"><strong>Не удалось проверить Ленту</strong><span>Можно продолжить: остальные магазины проверим при подборе корзины.</span><div><button type="button" onClick={() => setRetry((value) => value + 1)}>Попробовать ещё раз</button><button type="button" onClick={() => addressRef.current?.focus()}>Изменить адрес</button></div></div>}
        {status === "ready" && stores.length === 1 && (
          <div className="onboarding__selected-store"><Check aria-hidden="true" /><span><strong>{storeLabel(stores[0])}</strong>{stores[0].distanceMeters ? <small>{formatDistance(stores[0].distanceMeters)} от указанного адреса</small> : null}</span><button type="button" onClick={() => addressRef.current?.focus()}>Изменить</button></div>
        )}
        {status === "ready" && stores.length > 1 && (
          <fieldset className="onboarding__store-list">
            <legend>Ближайшая Лента выбрана автоматически</legend>
            {stores.map((store) => (
              <label key={store.id}>
                <input type="radio" name="lenta-store" checked={profile.lentaStoreId === store.id} onChange={() => onChange(withStore(profile, store))} />
                <span>{storeLabel(store)}{store.distanceMeters ? <small>{formatDistance(store.distanceMeters)}</small> : null}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      <div className="onboarding__footer">
        <p>Адрес используем для всех магазинов. Ленту выберем автоматически, если она доступна рядом.</p>
        <button
          className="onboarding__primary"
          type="button"
          disabled={!validAddress || submitting}
          onClick={() => void complete()}
        >
          {submitting ? "Продолжаем…" : "Продолжить"}
        </button>
      </div>
    </section>
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
