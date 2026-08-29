import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { UserProfile } from "../types/domain";
import { getSupabaseClient } from "../services/supabaseClient";
import { DEFAULT_PROFILE, loadGuestProfile, loadRemoteProfile, mergeGuestIntoRemote, normalizeProfile, saveGuestProfile, upsertRemoteProfile } from "../services/profileRepository";

export type AuthStatus = "guest" | "loading" | "signedOut" | "linkSent" | "signedIn" | "error";

export function useAuthProfile() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [profile, setProfile] = useState<UserProfile>(() => loadGuestProfile());
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => supabase ? "loading" : "guest");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(error.message);
        setAuthStatus("error");
        return;
      }
      void syncSignedInUser(data.session?.user ?? null, supabase, setProfile, setUser, setAuthStatus, setAuthError);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSignedInUser(session?.user ?? null, supabase, setProfile, setUser, setAuthStatus, setAuthError);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const sendOtp = useCallback(async (email: string) => {
    if (!supabase) return;
    const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
    if (!normalizedEmail) return;
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setAuthError(error.message);
      setAuthStatus("error");
      return;
    }
    setAuthStatus("linkSent");
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
      setAuthStatus("error");
      return;
    }
    setUser(null);
    setProfile(loadGuestProfile());
    setAuthStatus("signedOut");
  }, [supabase]);

  const updateProfile = useCallback((nextProfile: UserProfile) => {
    const normalized = normalizeProfile({ ...nextProfile, userId: user?.id ?? nextProfile.userId, email: user?.email ?? nextProfile.email });
    setProfile(normalized);
    saveGuestProfile(normalized);
    if (supabase && user) {
      void upsertRemoteProfile(normalized, supabase).catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
        setAuthStatus("error");
      });
    }
  }, [supabase, user]);

  return {
    authConfigured: Boolean(supabase),
    authError,
    authStatus,
    profile,
    sendOtp,
    signOut,
    updateProfile,
    user,
  };
}

async function syncSignedInUser(
  signedInUser: User | null,
  supabase: SupabaseClient,
  setProfile: (profile: UserProfile) => void,
  setUser: (user: User | null) => void,
  setAuthStatus: (status: AuthStatus) => void,
  setAuthError: (message: string | null) => void,
) {
  if (!signedInUser) {
    setUser(null);
    setProfile(loadGuestProfile());
    setAuthStatus("signedOut");
    return;
  }

  try {
    const guest = loadGuestProfile();
    const remote = await loadRemoteProfile(signedInUser.id, supabase);
    const emptyRemote = normalizeProfile({
      ...DEFAULT_PROFILE,
      userId: signedInUser.id,
      email: signedInUser.email,
    });
    const merged = mergeGuestIntoRemote(guest, remote ?? emptyRemote);
    const saved = await upsertRemoteProfile(merged, supabase);
    saveGuestProfile(saved);
    setUser(signedInUser);
    setProfile(saved);
    setAuthError(null);
    setAuthStatus("signedIn");
  } catch (error) {
    setAuthError(error instanceof Error ? error.message : "Не удалось загрузить профиль.");
    setAuthStatus("error");
  }
}
