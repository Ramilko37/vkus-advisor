# «Умная корзина» Brand Spec

Нейтральный независимый агрегатор продуктовых корзин. ВкусВилл, Лента и Пятёрочка выступают источниками товаров и не являются брендом приложения.

## Идея

**Три понятных варианта. Одна готовая корзина.**

Продукт говорит о результате, а не об AI-технологии. Характер: практичный, спокойный, умный, продуктовый, без визуальных AI-клише.

## Tokens

```css
:root {
  --background: #eef2ea;
  --surface: #ffffff;
  --surface-soft: #f6f8f3;
  --text-primary: #101511;
  --text-secondary: #4f5b52;
  --text-muted: #748075;
  --accent: #09911f;
  --accent-hover: #057519;
  --accent-soft: #e7f8e7;
  --accent-deep: #0d3424;
  --deal: #85d90f;
}
```

## Type

- UI and headings: `Noto Sans`, system-ui, sans-serif.
- Один кириллический sans stack вместо декоративного display font.
- Характер создаётся плотной иерархией, крупными числами и ясной композицией.

## Identity layers

- Pixel-art basket and products: brand, onboarding, loader, empty and success states, sharing.
- Lucide: system controls only.
- No decorative emoji at the same semantic level.

## Posture rules

- Начинать с task composer, не с marketing hero.
- Адрес запрашивать только после реального запроса или явного действия.
- Green использовать для бренда, primary action, selected state и положительного сравнения.
- White and near-white surfaces keep the product readable.
- Retailer names use neutral source labels; no official affiliation claim.
- Product imagery is useful and tied to actual basket contents.
- Errors explain what user can do next without provider jargon.
