import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "./supabaseClient";

describe("getSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when Supabase env is missing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    expect(getSupabaseClient()).toBeNull();
  });
});
