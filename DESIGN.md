---
name: "Умная корзина"
description: "Focused mobile AI utility that turns a grocery task into comparable real baskets from several retailers."
colors:
  background: "#eef2ea"
  surface: "#ffffff"
  surfaceSoft: "#f6f8f3"
  ink: "#101511"
  textSecondary: "#4f5b52"
  textMuted: "#748075"
  groceryGreen: "#09911f"
  groceryGreenHover: "#057519"
  groceryGreenSoft: "#e7f8e7"
  deepGreen: "#0d3424"
  dealLime: "#85d90f"
  mint: "#dff8ef"
  checkoutBlack: "#101511"
  warning: "#9a6700"
  warningSoft: "#fff8e8"
  error: "#b42318"
  errorSoft: "#fff1ef"
typography:
  fontFamily: '"Noto Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  screenTitle: "34px"
  cardTitle: "22px"
  bodySize: "16px"
  labelSize: "13px"
  weightNormal: 500
  weightStrong: 720
  weightAction: 780
radii:
  small: "10px"
  control: "16px"
  card: "16px"
  large: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
---

# Дизайн-система «Умной корзины»

## 1. North star

A focused mobile AI utility for turning a grocery task into comparable real baskets.

Приложение должно ощущаться как самостоятельный помощник для принятия решения, а не как недоделанный маркетплейс, чат-демо или рекламный лендинг.

## 2. Основной flow

`задача -> адрес при необходимости -> магазины -> три стратегии -> follow-up -> состав -> покупка или список`

Главный экран начинается с task composer. На нём нет фиктивного поиска по каталогу, товарных отделов, промо-hero, избранного, подарков и пяти пунктов нижней навигации.

## 3. Визуальный язык

- Бледный зелёно-серый canvas и белые content surfaces.
- Тёмно-зелёный для бренда и главных действий.
- Лайм только для положительного статуса или рекомендации.
- Чёрный для финального checkout action.
- Небольшие тени и ясные borders вместо большого количества парящих карточек.
- Liquid Glass только для floating controls, dialogs и loader, когда он помогает иерархии.

## 4. Pixel-art identity

Pixel art - постоянный брендовый слой:

- app icon и favicon;
- первый экран onboarding;
- animated loader;
- empty states;
- success states;
- OG-image.

Lucide остаётся слоем системных иконок. Декоративные emoji не используются как часть идентичности.

## 5. Типографика

- Screen title: 34 px, strong, balanced wrapping.
- Card title: 22 px, compact line-height.
- Body: 16 px, medium weight.
- Label: 13 px без искусственного uppercase tracking.
- Цены: tabular numbers и высокий контраст.

## 6. Layout

### Home

1. Brand lockup.
2. Реальный delivery context.
3. Profile и help controls.
4. Компактный value statement.
5. Task composer.
6. Goal-oriented prompt helpers.
7. Готовые примеры запросов.

### Results

1. Новый запрос.
2. Итоговый intent и `Изменить запрос`.
3. Только доступные ритейлеры с минимальной ценой и checkout capability.
4. Три стратегии выбранного магазина.
5. Conversational follow-up.

### Basket

1. Магазин и capability один раз в header.
2. Состав с полезными catalog attributes.
3. Quantity, replace и delete.
4. Freshness disclaimer.
5. Floating checkout bar.

## 7. Компоненты

### Delivery control

Показывает сохранённый адрес в компактном виде. При отсутствии адреса показывает `Адрес не указан / Добавить`. Клик сразу открывает delivery setup.

### Composer

Главный control продукта. Prompt helpers описывают пользовательские задачи: `На неделю`, `Экономно`, `Для семьи`, `Без готовки`.

### Retailer selector

Показывает только магазины с готовыми вариантами. Каждый вариант содержит название, минимальную цену и capability `Автокорзина` или `Список`.

### Basket strategy card

Три уровня информации:

1. Название и recommendation.
2. Цена и одна строка сравнения.
3. До трёх товаров, trade-off и `Посмотреть состав`.

### Checkout

Final action явно различает автоматическую корзину и ручной список. Техническая операция не выдаётся за пользовательский результат.

## 8. Responsive и accessibility

- Mobile-first, 320 px без horizontal overflow.
- Touch target минимум 44 px.
- Email auth stack на узком экране.
- Fixed checkout не перекрывает последний товар.
- Address autocomplete работает с клавиатуры.
- Visible focus rings.
- Reduced-motion сохраняет смысл всех состояний.
