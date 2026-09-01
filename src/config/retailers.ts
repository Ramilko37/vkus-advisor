import type { NormalizedProduct } from "../types/domain";

export type RetailerKey = NonNullable<NormalizedProduct["retailer"]>;
export type CheckoutCapability = "auto-cart" | "manual-list";

export type RetailerConfig = {
  label: string;
  capability: CheckoutCapability;
  capabilityLabel: string;
  checkoutLabel: string;
  unavailableLabel: string;
};

export const RETAILERS: Record<RetailerKey, RetailerConfig> = {
  vkusvill: {
    label: "ВкусВилл",
    capability: "auto-cart",
    capabilityLabel: "Автокорзина",
    checkoutLabel: "Открыть корзину во ВкусВилле",
    unavailableLabel: "Автокорзина недоступна",
  },
  lenta: {
    label: "Лента",
    capability: "manual-list",
    capabilityLabel: "Список",
    checkoutLabel: "Проверить и скопировать список Ленты",
    unavailableLabel: "Список Ленты недоступен",
  },
  pyaterochka: {
    label: "Пятёрочка",
    capability: "manual-list",
    capabilityLabel: "Список",
    checkoutLabel: "Проверить и скопировать список Пятёрочки",
    unavailableLabel: "Список Пятёрочки недоступен",
  },
  demo: {
    label: "Демо",
    capability: "manual-list",
    capabilityLabel: "Пример",
    checkoutLabel: "Скопировать пример",
    unavailableLabel: "Действие недоступно",
  },
};
