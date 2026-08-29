import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile } from "../types/domain";
import { getSupabaseClient } from "./supabaseClient";

export const PROFILE_STORAGE_KEY = "vkusvill-advisor:user-profile";

export const DEFAULT_PROFILE: UserProfile = {
  address: "",
  householdSize: 1,
  defaultDays: 3,
  defaultBudgetRub: null,
  excludedIngredients: [],
  preferences: [],
};

interface ProfileRow {
  user_id: string;
  email: string | null;
  address: string;
  household_size: number;
  default_days: number;
  default_budget_rub: number | null;
  excluded_ingredients: string[];
  preferences: string[];
}

export function loadGuestProfile(): UserProfile {
  try {
    return normalizeProfile(JSON.parse(readProfileStorage() || "{}"));
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveGuestProfile(profile: UserProfile) {
  writeProfileStorage(JSON.stringify(normalizeProfile(profile)));
}

export function mergeGuestIntoRemote(guest: UserProfile, remote: UserProfile): UserProfile {
  const normalizedGuest = normalizeProfile(guest);
  const normalizedRemote = normalizeProfile(remote);
  if (!isEmptyRemoteProfile(normalizedRemote)) return normalizedRemote;
  return {
    ...normalizedGuest,
    userId: normalizedRemote.userId,
    email: normalizedRemote.email,
  };
}

export async function loadRemoteProfile(userId: string, client = getSupabaseClient()): Promise<UserProfile | null> {
  if (!client) return null;
  const { data, error } = await client
    .from("profiles")
    .select("user_id,email,address,household_size,default_days,default_budget_rub,excluded_ingredients,preferences")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as ProfileRow) : null;
}

export async function upsertRemoteProfile(profile: UserProfile, client = getSupabaseClient()): Promise<UserProfile> {
  if (!client || !profile.userId) return normalizeProfile(profile);
  const row = toRow(normalizeProfile(profile));
  const { data, error } = await client
    .from("profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id,email,address,household_size,default_days,default_budget_rub,excluded_ingredients,preferences")
    .single();
  if (error) throw error;
  return fromRow(data as ProfileRow);
}

export function normalizeProfile(profile: Partial<UserProfile>): UserProfile {
  return {
    userId: textOrUndefined(profile.userId),
    email: textOrUndefined(profile.email),
    address: cleanText(profile.address),
    householdSize: clampNumber(profile.householdSize, 1, 12, DEFAULT_PROFILE.householdSize),
    defaultDays: clampNumber(profile.defaultDays, 1, 14, DEFAULT_PROFILE.defaultDays),
    defaultBudgetRub: profile.defaultBudgetRub === null || profile.defaultBudgetRub === undefined ? null : clampNumber(profile.defaultBudgetRub, 100, 100000, DEFAULT_PROFILE.defaultBudgetRub ?? 3000),
    excludedIngredients: cleanList(profile.excludedIngredients),
    preferences: cleanList(profile.preferences),
  };
}

function fromRow(row: ProfileRow): UserProfile {
  return normalizeProfile({
    userId: row.user_id,
    email: row.email ?? undefined,
    address: row.address,
    householdSize: row.household_size,
    defaultDays: row.default_days,
    defaultBudgetRub: row.default_budget_rub,
    excludedIngredients: row.excluded_ingredients,
    preferences: row.preferences,
  });
}

function toRow(profile: UserProfile): ProfileRow {
  return {
    user_id: profile.userId || "",
    email: profile.email || null,
    address: profile.address,
    household_size: profile.householdSize,
    default_days: profile.defaultDays,
    default_budget_rub: profile.defaultBudgetRub,
    excluded_ingredients: profile.excludedIngredients,
    preferences: profile.preferences,
  };
}

function isEmptyRemoteProfile(profile: UserProfile) {
  return profile.address === ""
    && profile.householdSize === DEFAULT_PROFILE.householdSize
    && profile.defaultDays === DEFAULT_PROFILE.defaultDays
    && profile.defaultBudgetRub === DEFAULT_PROFILE.defaultBudgetRub
    && profile.excludedIngredients.length === 0
    && profile.preferences.length === 0;
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textOrUndefined(value: unknown) {
  const text = cleanText(value);
  return text || undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, number));
}

function readProfileStorage() {
  try {
    return window.localStorage?.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeProfileStorage(value: string) {
  try {
    window.localStorage?.setItem(PROFILE_STORAGE_KEY, value);
  } catch {
    // Guest profile persistence is best-effort; auth-backed profiles still work.
  }
}
