import { z } from "zod";
import type { StructuredGenerationResult } from "../types/domain";

const SESSION_STORAGE = "basket.sessionId";

export function getSessionId() {
  const existing = sessionStorage.getItem(SESSION_STORAGE);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(SESSION_STORAGE, next);
  return next;
}

export class OpenRouterError extends Error {
  constructor(readonly code: "unauthorized" | "rate_limit" | "timeout" | "invalid" | "network", message: string) {
    super(message);
  }
}

export class BrowserOpenRouterClient {
  async generateStructured<T>(options: {
    systemPrompt: string;
    userPayload: unknown;
    jsonSchema: Record<string, unknown>;
    validator: z.ZodType<T>;
    sessionId: string;
    stage: "intent" | "basket";
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<StructuredGenerationResult<T>> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    try {
      const response = await fetch("/api/openrouter", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: options.systemPrompt,
          userPayload: options.userPayload,
          jsonSchema: options.jsonSchema,
          sessionId: options.sessionId,
          stage: options.stage,
          maxTokens: options.maxTokens,
        }),
      });

      if (response.status === 401) throw new OpenRouterError("unauthorized", "OPENROUTER_API_KEY не настроен на сервере.");
      if (response.status === 429) throw new OpenRouterError("rate_limit", "Бесплатная модель не приняла запрос из-за ограничения частоты. Текущие данные сохранены.");
      if (response.status >= 500) throw new OpenRouterError("network", "OpenRouter временно недоступен.");
      if (!response.ok) throw new OpenRouterError("network", "OpenRouter вернул ошибку запроса.");

      const payload = await response.json() as StructuredGenerationResult<unknown>;
      const validated = options.validator.safeParse(payload.data);
      if (!validated.success) {
        throw new OpenRouterError("invalid", "Модель вернула неподходящий формат. Повторите сборку корзины.");
      }
      return {
        data: validated.data as T,
        model: payload.model,
        usage: payload.usage,
        finishReason: payload.finishReason,
        durationMs: payload.durationMs,
        retryCount: payload.retryCount,
        fallbackModelUsed: payload.fallbackModelUsed,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new OpenRouterError("timeout", "Модель не успела сформировать ответ. Можно повторить запрос.");
      if (error instanceof OpenRouterError) throw error;
      throw new OpenRouterError("network", "Не удалось выполнить запрос к OpenRouter.");
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
