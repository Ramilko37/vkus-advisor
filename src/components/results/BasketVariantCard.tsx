import type { BasketVariant } from "../../types/domain";
import { getVariantPresentation } from "../../services/variantPresentation";
import "./results.css";

type BasketVariantCardProps = {
  variant: BasketVariant;
  variants: BasketVariant[];
  recommended: boolean;
  onSelect: () => void;
};

export function BasketVariantCard({ variant, variants, recommended, onSelect }: BasketVariantCardProps) {
  const presentation = getVariantPresentation(variant, variants);

  return (
    <article className="basket-variant-card" data-od-id={`variant-card-${variant.id}`}>
      <button type="button" onClick={onSelect} aria-label={`Посмотреть состав: ${presentation.title}`}>
        <header>
          <div>
            <h2>{presentation.title}</h2>
            <p>{presentation.subtitle}</p>
          </div>
          {recommended && <span className="recommend-badge">Рекомендуем</span>}
        </header>
        <strong className="basket-variant-card__price">{variant.totalRub.toLocaleString("ru-RU")} ₽</strong>
        <p className={`basket-variant-card__comparison is-${presentation.priceDeltaTone}`}>
          {presentation.priceDeltaLabel} · {presentation.itemCountLabel} · {presentation.cookingLabel}
        </p>
        {presentation.previewItems.length > 0 && (
          <ul className="basket-variant-card__preview" aria-label="В составе">
            {presentation.previewItems.map((name) => <li key={name}>{name}</li>)}
          </ul>
        )}
        <p className="basket-variant-card__tradeoff">{presentation.tradeoffText}</p>
        <span className="basket-variant-card__action">Посмотреть состав</span>
      </button>
    </article>
  );
}
