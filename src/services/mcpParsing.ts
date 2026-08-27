import type { NormalizedProduct } from "../types/domain";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" || typeof value === "number" ? String(value) : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

const asNested = (value: unknown, key: string) => asNumber(asRecord(value)?.[key]);
const cleanText = (value: string | undefined) => value?.replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, "\n").trim();
const propertyValue = (record: JsonRecord, name: string) => {
  const properties = record.properties;
  if (!Array.isArray(properties)) return undefined;
  const found = properties.find((item) => {
    const property = asRecord(item);
    return typeof property?.name === "string" && property.name.toLocaleLowerCase("ru-RU").includes(name);
  });
  return cleanText(asString(asRecord(found)?.value));
};

const imageValue = (record: JsonRecord): string | undefined => {
  const direct = asString(record.image ?? record.imageUrl ?? record.image_url ?? record.picture ?? record.photo ?? record.thumbnail);
  if (direct) return direct;
  const images = record.images;
  if (!Array.isArray(images)) return undefined;
  for (const item of images) {
    const image = asRecord(item);
    const url = image && asString(image.medium ?? image.small ?? image.large ?? image.url);
    if (url) return url;
  }
  return undefined;
};

export function extractJsonFromText(text: string): unknown | null {
  const direct = tryParse(text);
  if (direct !== null) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed !== null) return parsed;
  }

  const start = text.search(/\{|\[/);
  if (start < 0) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) return tryParse(text.slice(start, index + 1));
  }
  return null;
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseMcpResponse(response: unknown): unknown {
  if (typeof response === "string") {
    const dataLines = response
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""))
      .join("\n");
    const parsed = extractJsonFromText(dataLines || response);
    return unwrapContent(parsed ?? response);
  }
  return unwrapContent(response);
}

function unwrapContent(value: unknown): unknown {
  const record = asRecord(value);
  const content = record?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const text = asRecord(part)?.text;
      if (typeof text === "string") {
        const parsed = extractJsonFromText(text);
        if (parsed !== null) return parsed;
      }
    }
  }
  if (typeof value === "string") return extractJsonFromText(value) ?? value;
  return value;
}

export function normalizeSearchProduct(raw: unknown, sourceQuery: string, isDemo: boolean): NormalizedProduct | null {
  const record = asRecord(raw);
  if (!record) return null;
  const xmlId = asString(record.xml_id ?? record.xmlId ?? record.xmlID ?? record.id);
  const name = asString(record.name ?? record.title ?? record.product_name);
  const priceRub = asNumber(record.priceRub ?? record.current_price ?? record.price_rub) ?? asNested(record.price, "current") ?? asNumber(record.price);
  if (!xmlId || !name || !priceRub || priceRub <= 0) return null;
  const url = asString(record.url ?? record.productUrl ?? record.link);
  const imageUrl = imageValue(record);
  return {
    id: asString(record.id) ?? xmlId,
    xmlId,
    name: cleanText(name) ?? name,
    priceRub,
    oldPriceRub: asNumber(record.oldPriceRub ?? record.old_price) ?? asNested(record.price, "old"),
    rating: asNumber(record.rating) ?? asNested(record.rating, "average"),
    reviewsCount: asNumber(record.reviewsCount ?? record.reviews_count) ?? asNested(record.rating, "count"),
    weightLabel: asString(record.weightLabel ?? record.weight ?? record.volume),
    imageUrl,
    productUrl: url,
    description: cleanText(asString(record.description)),
    composition: cleanText(asString(record.composition ?? record.ingredients)) ?? propertyValue(record, "состав"),
    calories: asNumber(record.calories),
    proteins: asNumber(record.proteins),
    fats: asNumber(record.fats),
    carbohydrates: asNumber(record.carbohydrates),
    sourceQuery,
    isDemo,
  };
}

export function normalizeProductDetails(raw: unknown): Partial<NormalizedProduct> {
  const record = asRecord(raw);
  const value = asRecord(record?.data) ?? raw;
  const product = normalizeSearchProduct(value, "details", false);
  if (product) return product;
  const details = asRecord(value);
  if (!details) return {};
  return {
    imageUrl: imageValue(details),
    productUrl: asString(details.url ?? details.productUrl ?? details.link),
    description: cleanText(asString(details.description)),
    composition: cleanText(asString(details.composition ?? details.ingredients)) ?? propertyValue(details, "состав"),
    calories: asNumber(details.calories),
    proteins: asNumber(details.proteins),
    fats: asNumber(details.fats),
    carbohydrates: asNumber(details.carbohydrates),
  };
}

export function extractCartUrl(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const url = asString(asRecord(raw)?.url) ?? text.match(/https:\/\/[^\s"'<>]+/)?.[0];
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("vkusvill.ru")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
