import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE, loadGuestProfile, saveGuestProfile } from "../services/profileRepository";
import { useAuthProfile } from "./useAuthProfile";

const mocks = vi.hoisted(() => ({
  client: null as MockSupabaseClient | null,
  loadRemoteProfile: vi.fn(),
  upsertRemoteProfile: vi.fn(),
}));

vi.mock("../services/supabaseClient", () => ({
  getSupabaseClient: () => mocks.client,
}));

vi.mock("../services/profileRepository", async () => {
  const actual = await vi.importActual<typeof import("../services/profileRepository")>("../services/profileRepository");
  return {
    ...actual,
    loadRemoteProfile: mocks.loadRemoteProfile,
    upsertRemoteProfile: mocks.upsertRemoteProfile,
  };
});

interface MockSupabaseClient {
  auth: {
    getSession: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
    signInWithOtp: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
}

type AuthStateHandler = (event: string, session: { user: { id: string; email?: string } } | null) => Promise<void> | void;

describe("useAuthProfile", () => {
  let authHandler: AuthStateHandler | null = null;

  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    authHandler = null;
    mocks.client = null;
    mocks.loadRemoteProfile.mockReset();
    mocks.upsertRemoteProfile.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps guest profile local when Supabase is not configured", () => {
    const { result } = renderHook(() => useAuthProfile());

    act(() => {
      result.current.updateProfile({ ...DEFAULT_PROFILE, address: "Москва", householdSize: 2 });
    });

    expect(result.current.authStatus).toBe("guest");
    expect(result.current.profile.address).toBe("Москва");
    expect(loadGuestProfile().householdSize).toBe(2);
  });

  it("merges guest profile into an empty remote profile after sign in", async () => {
    saveGuestProfile({ ...DEFAULT_PROFILE, address: "Москва", householdSize: 2, defaultBudgetRub: 3000 });
    mocks.loadRemoteProfile.mockResolvedValue({ ...DEFAULT_PROFILE, userId: "user-1", email: "user@example.com" });
    mocks.upsertRemoteProfile.mockImplementation(async (profile) => profile);
    mocks.client = createMockClient((handler) => {
      authHandler = handler;
    });

    const { result } = renderHook(() => useAuthProfile());

    await waitFor(() => expect(mocks.client?.auth.onAuthStateChange).toHaveBeenCalled());
    await act(async () => {
      await authHandler?.("SIGNED_IN", { user: { id: "user-1", email: "user@example.com" } });
    });

    await waitFor(() => expect(result.current.authStatus).toBe("signedIn"));
    expect(mocks.upsertRemoteProfile).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      email: "user@example.com",
      address: "Москва",
      householdSize: 2,
      defaultBudgetRub: 3000,
    }), mocks.client);
  });

  it("sends an email OTP through Supabase auth", async () => {
    mocks.client = createMockClient((handler) => {
      authHandler = handler;
    });
    const { result } = renderHook(() => useAuthProfile());

    await act(async () => {
      await result.current.sendOtp(" USER@EXAMPLE.COM ");
    });

    expect(mocks.client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: window.location.origin },
    });
    expect(result.current.authStatus).toBe("linkSent");
  });
});

function createMockClient(registerHandler: (handler: AuthStateHandler) => void): MockSupabaseClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn((handler) => {
        registerHandler(handler);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}
