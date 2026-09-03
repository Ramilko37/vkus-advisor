import "./pixel-basket-mark.css";

type PixelBasketMarkProps = {
  size?: number;
  className?: string;
  state?: "idle" | "empty" | "success";
  decorative?: boolean;
};

export function PixelBasketMark({
  size = 72,
  className = "",
  state = "idle",
  decorative = true,
}: PixelBasketMarkProps) {
  const label = decorative ? undefined : state === "success" ? "Корзина готова" : "Пустая корзина";

  return (
    <svg
      data-testid="pixel-basket-mark"
      className={`pixel-basket-mark pixel-basket-mark--${state} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={label}
    >
      <rect x="14" y="25" width="36" height="6" rx="1" />
      <rect x="18" y="31" width="28" height="20" rx="2" />
      <rect x="23" y="18" width="6" height="7" rx="1" />
      <rect x="35" y="18" width="6" height="7" rx="1" />
      <rect className="pixel-basket-mark__accent" x="25" y="36" width="6" height="6" rx="1" />
      <rect className="pixel-basket-mark__accent" x="34" y="36" width="6" height="6" rx="1" />
    </svg>
  );
}
