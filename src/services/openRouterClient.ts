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

export class LlmProviderError extends Error {
  constructor(readonly code: "unauthorized" | "rate_limit" | "timeout" | "invalid" | "network", message: string) {
    super(message);
  }
}

export class BrowserLlmClient {
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
    const timeoutMs = options.stage === "basket" ? 75_000 : 45_000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    try {
      const response = await fetch("/api/llm", {
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

      if (response.status === 401) throw new LlmProviderError("unauthorized", "NEURALDEEP_API_KEY не настроен на сервере.");
      if (response.status === 429) throw new LlmProviderError("rate_limit", "Модель не приняла запрос из-за ограничения частоты. Текущие данные сохранены.");
      if (response.status >= 500) throw new LlmProviderError("network", "LLM-провайдер временно недоступен.");
      if (!response.ok) throw new LlmProviderError("network", "LLM-провайдер вернул ошибку запроса.");

      const payload = await response.json() as StructuredGenerationResult<unknown>;
      const validated = options.validator.safeParse(payload.data);
      if (!validated.success) {
        throw new LlmProviderError("invalid", "Модель вернула неподходящий формат. Повторите сборку корзины.");
      }
      return {
        data: validated.data as T,
        model: payload.model,
        usage: payload.usage,
        finishReason: payload.finishReason,
        durationMs: payload.durationMs,
        retryCount: payload.retryCount,
        fallbackModelUsed: payload.fallbackModelUsed,
        repairRequired: payload.repairRequired,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new LlmProviderError("timeout", "Модель не успела сформировать ответ. Можно повторить запрос.");
      if (error instanceof LlmProviderError) throw error;
      throw new LlmProviderError("network", "Не удалось выполнить запрос к LLM-провайдеру.");
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const OpenRouterError = LlmProviderError;
export const BrowserOpenRouterClient = BrowserLlmClient;
