import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BrowserOpenRouterClient } from "./openRouterClient";

describe("BrowserOpenRouterClient", () => {
  it("sends structured generation through local API without browser secrets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true }, model: "server-model" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new BrowserOpenRouterClient();
    const result = await client.generateStructured({
      systemPrompt: "system",
      userPayload: { message: "hello" },
      jsonSchema: { type: "object" },
      validator: z.object({ ok: z.boolean() }),
      sessionId: "session",
      stage: "intent",
    });

    expect(result.model).toBe("server-model");
    expect(fetchMock).toHaveBeenCalledWith("/api/openrouter", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).not.toHaveProperty("validator");
    expect(requestBody.stage).toBe("intent");
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain("Authorization");
  });
});
