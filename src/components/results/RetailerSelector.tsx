import type { RetailerKey } from "../../config/retailers";
import type { RetailerOption } from "../../services/retailerPresentation";
import "./results.css";

type RetailerSelectorProps = {
  options: RetailerOption[];
  activeKey: RetailerKey;
  onSelect: (key: RetailerKey) => void;
};

export function RetailerSelector({ options, activeKey, onSelect }: RetailerSelectorProps) {
  if (options.length <= 1) return null;

  return (
    <div className="retailer-selector" role="tablist" aria-label="Магазин">
      {options.map((option) => (
        <button
          key={option.key}
          className="retailer-selector__option"
          type="button"
          role="tab"
          aria-selected={option.key === activeKey}
          onClick={() => onSelect(option.key)}
        >
          <strong>{option.label}</strong>
          <span>от {option.minPriceRub.toLocaleString("ru-RU")} ₽ · {option.capabilityLabel}</span>
        </button>
      ))}
    </div>
  );
}
