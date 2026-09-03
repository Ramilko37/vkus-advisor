import { CircleHelp, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND } from "../../config/brand";
import { formatDeliveryAddress } from "../../services/addressPresentation";
import type { UserProfile } from "../../types/domain";
import { PixelBasketMark } from "../brand/PixelBasketMark";
import "./home.css";

type HomeHeaderProps = {
  profile: UserProfile;
  onOpenDelivery: () => void;
  onOpenHelp: () => void;
  profileControl: ReactNode;
};

export function HomeHeader({ profile, onOpenDelivery, onOpenHelp, profileControl }: HomeHeaderProps) {
  const compactAddress = formatDeliveryAddress(profile.address);
  const deliveryLabel = compactAddress
    ? `Доставка, ${compactAddress}`
    : "Адрес не указан, Добавить";

  return (
    <header className="home-header" data-od-id="app-header">
      <div className="home-utility-bar">
        <div className="brand-lockup" aria-label={BRAND.name}>
          <PixelBasketMark size={38} />
          <strong>{BRAND.name}</strong>
        </div>

        <button type="button" className="delivery-control" onClick={onOpenDelivery} aria-label={deliveryLabel}>
          <MapPin size={17} aria-hidden="true" />
          <span>
            <small>{compactAddress ? "Доставка" : "Адрес не указан"}</small>
            <strong>{compactAddress ?? "Добавить"}</strong>
          </span>
        </button>

        <div className="home-utility-actions">
          {profileControl}
          <button type="button" className="home-icon-button" onClick={onOpenHelp} aria-label="Как это работает">
            <CircleHelp size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="home-value">
        <h1>Что нужно купить?</h1>
        <p>Опишите задачу — сравним три варианта по цене и времени на готовку.</p>
      </div>
    </header>
  );
}
