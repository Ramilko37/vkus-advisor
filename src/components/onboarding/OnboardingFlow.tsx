import { Loader2, MapPin, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { resolveDeliveryContext, reverseGeocodeAddress, suggestAddresses } from "../../services/catalog";
import { trackProductEvent } from "../../services/productAnalytics";
import { normalizeProfile } from "../../services/profileRepository";
import type { Retailer, UserProfile } from "../../types/domain";
import "./onboarding-flow.css";

interface OnboardingFlowProps {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void | Promise<void>;
  onComplete: (profile: UserProfile, retailers: Retailer[]) => void;
  onCancel?: () => void;
}

const geoStatusCopy = {
  ready: "Адрес определён.",
  empty: "Не удалось найти адрес в этой точке — введите его вручную.",
  denied: "Доступ к геопозиции запрещён — введите адрес вручную.",
  unsupported: "Браузер не поддерживает геолокацию — введите адрес вручную.",
  error: "Не удалось определить адрес — попробуйте ещё раз или введите его вручную.",
};

export function OnboardingFlow({ profile, onProfileChange, onComplete, onCancel }: OnboardingFlowProps) {
  const [draft, setDraft] = useState(() => normalizeProfile(profile));
  const [status, setStatus] = useState<"idle" | "loading" | "address_not_found" | "no_retailers" | "error">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ready" | "empty" | "denied" | "unsupported" | "error">("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const resolutionRef = useRef<AbortController | null>(null);
  const geolocationRef = useRef<AbortController | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const selectedAddressRef = useRef("");
  const address = draft.address.trim();
  const validAddress = address.length >= 8 && /\d/.test(address);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => document.getElementById("onboarding-title")?.focus({ preventScroll: true }));
    trackProductEvent("onboarding_shown", { step: "delivery" });
    return () => {
      resolutionRef.current?.abort();
      geolocationRef.current?.abort();
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => restoreFocusRef.current?.isConnected && restoreFocusRef.current.focus(), 0);
    };
  }, []);

  useEffect(() => {
    if (address.length < 3 || selectedAddressRef.current === draft.address) {
      selectedAddressRef.current = "";
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSuggestionLoading(true);
      try {
        const values = await suggestAddresses(address, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(values);
        setSuggestionsOpen(values.length > 0);
        setActiveSuggestion(-1);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [address, draft.address]);

  const updateAddress = (value: string) => {
    resolutionRef.current?.abort();
    resolutionRef.current = null;
    geolocationRef.current?.abort();
    geolocationRef.current = null;
    setDraft((current) => ({
      ...current,
      address: value,
      lentaStoreId: undefined,
      lentaStoreName: undefined,
      lentaStoreAddress: undefined,
    }));
    setStatus("idle");
  };

  const selectAddress = (value: string) => {
    selectedAddressRef.current = value;
    setSuggestions([]);
    setSuggestionsOpen(false);
    updateAddress(value);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validAddress || status === "loading") return;
    const controller = new AbortController();
    resolutionRef.current?.abort();
    resolutionRef.current = controller;
    setStatus("loading");
    trackProductEvent("onboarding_store_search_started");
    try {
      const context = await resolveDeliveryContext(address, controller.signal);
      if (controller.signal.aborted) return;
      if (context.status !== "ready") {
        setStatus(context.status);
        return;
      }
      const next = normalizeProfile({
        ...draft,
        address: context.address,
        lentaStoreId: context.lentaStore?.id,
        lentaStoreName: context.lentaStore?.name,
        lentaStoreAddress: context.lentaStore?.address,
      });
      await onProfileChange(next);
      if (controller.signal.aborted) return;
      trackProductEvent("onboarding_address_entered", { has_lenta_store: Boolean(next.lentaStoreId), retailers: context.retailers });
      onComplete(next, context.retailers);
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (resolutionRef.current === controller) resolutionRef.current = null;
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    geolocationRef.current?.abort();
    const controller = new AbortController();
    geolocationRef.current = controller;
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (controller.signal.aborted) return;
        void reverseGeocodeAddress(coords.latitude, coords.longitude, controller.signal).then((values) => {
          if (controller.signal.aborted) return;
          if (!values.length) {
            setGeoStatus("empty");
            return;
          }
          if (geolocationRef.current === controller) geolocationRef.current = null;
          selectAddress(values[0]);
          setGeoStatus("ready");
        }).catch(() => {
          if (!controller.signal.aborted) setGeoStatus("error");
        });
      },
      (error) => {
        if (!controller.signal.aborted) setGeoStatus(error.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const handleAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestionsOpen(false);
      return;
    }
    if (!suggestions.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
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

  const cancel = () => {
    resolutionRef.current?.abort();
    onCancel?.();
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'));
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

  return (
    <div ref={dialogRef} className="onboarding" role="dialog" aria-modal="true" aria-label="Адрес доставки" onKeyDown={handleDialogKeyDown}>
      <div className="onboarding__frame onboarding__frame--address">
        {onCancel && (
          <header className="onboarding__header onboarding__header--address">
            <span className="onboarding__header-spacer" />
            <button className="onboarding__icon-button" type="button" onClick={cancel} aria-label="Закрыть изменение адреса"><X aria-hidden="true" /></button>
          </header>
        )}
        <form className="onboarding__content onboarding__address-gate" onSubmit={submit}>
          <div className="onboarding__hero-mark" aria-hidden="true"><MapPin /></div>
          <h1 id="onboarding-title" tabIndex={-1}>Куда доставить продукты?</h1>
          <p className="onboarding__lead">Адрес нужен, чтобы искать товары и цены в магазинах рядом с вами.</p>

          <div className="onboarding__field onboarding__address-field">
            <label htmlFor="onboarding-address">Адрес</label>
            <div className="onboarding__address-control">
              <input
                id="onboarding-address"
                className="onboarding__address-input"
                value={draft.address}
                onChange={(event) => updateAddress(event.target.value)}
                onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 100)}
                onKeyDown={handleAddressKeyDown}
                placeholder="Москва, улица, дом"
                autoComplete="street-address"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen}
                aria-controls="onboarding-address-suggestions"
                aria-activedescendant={activeSuggestion >= 0 ? `onboarding-address-suggestion-${activeSuggestion}` : undefined}
              />
              {suggestionLoading && <Loader2 className="onboarding__address-loader spin" aria-label="Ищем адреса" />}
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
                      <MapPin aria-hidden="true" /><span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="onboarding__detect-address" type="button" onClick={detectLocation} disabled={geoStatus === "loading"}>
              {geoStatus === "loading" ? <Loader2 className="spin" aria-hidden="true" /> : <MapPin aria-hidden="true" />}
              {geoStatus === "loading" ? "Определяем адрес…" : "Использовать геопозицию"}
            </button>
            {geoStatus !== "idle" && geoStatus !== "loading" && <small role="status">{geoStatusCopy[geoStatus]}</small>}
          </div>

          <div className="onboarding__store-status" aria-live="polite">
            {status === "loading" && <p><Loader2 className="spin" aria-hidden="true" />Ищем магазины рядом…</p>}
            {status === "address_not_found" && <p className="onboarding__field-error">Не нашли этот адрес. Проверьте написание или укажите другой.</p>}
            {status === "no_retailers" && <p className="onboarding__field-error">Пока не нашли магазины, с которыми умеем работать по этому адресу.</p>}
            {status === "error" && <p className="onboarding__field-error">Не удалось проверить магазины. Попробуйте ещё раз.</p>}
          </div>

          <div className="onboarding__footer">
            <button className="onboarding__primary" type="submit" disabled={!validAddress || status === "loading"}>Продолжить</button>
          </div>
        </form>
      </div>
    </div>
  );
}
