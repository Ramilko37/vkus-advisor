import type { UserProfile } from "../types/domain";
import { getSupabaseClient } from "./supabaseClient";

export const PROFILE_STORAGE_KEY = "vkusvill-advisor:user-profile";

export const DEFAULT_PROFILE: UserProfile = {
  address: "",
  householdSize: 1,
  excludedIngredients: [],
  preferences: [],
};

interface ProfileRow {
  user_id: string;
  email: string | null;
  address: string;
  lenta_store_id: string | null;
  lenta_store_name: string | null;
  lenta_store_address: string | null;
  household_size: number;
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
    .select("user_id,email,address,lenta_store_id,lenta_store_name,lenta_store_address,household_size,excluded_ingredients,preferences")
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
    .select("user_id,email,address,lenta_store_id,lenta_store_name,lenta_store_address,household_size,excluded_ingredients,preferences")
    .single();
  if (error) throw error;
  return fromRow(data as ProfileRow);
}

export function normalizeProfile(profile: Partial<UserProfile>): UserProfile {
  const lentaStoreId = textOrUndefined(profile.lentaStoreId);
  return {
    userId: textOrUndefined(profile.userId),
    email: textOrUndefined(profile.email),
    address: cleanText(profile.address),
    ...(lentaStoreId ? {
      lentaStoreId,
      lentaStoreName: textOrUndefined(profile.lentaStoreName),
      lentaStoreAddress: textOrUndefined(profile.lentaStoreAddress),
    } : {}),
    householdSize: clampNumber(profile.householdSize, 1, 12, DEFAULT_PROFILE.householdSize),
    excludedIngredients: cleanList(profile.excludedIngredients),
    preferences: cleanList(profile.preferences),
  };
}

function fromRow(row: ProfileRow): UserProfile {
  return normalizeProfile({
    userId: row.user_id,
    email: row.email ?? undefined,
    address: row.address,
    lentaStoreId: row.lenta_store_id ?? undefined,
    lentaStoreName: row.lenta_store_name ?? undefined,
    lentaStoreAddress: row.lenta_store_address ?? undefined,
    householdSize: row.household_size,
    excludedIngredients: row.excluded_ingredients,
    preferences: row.preferences,
  });
}

function toRow(profile: UserProfile): ProfileRow {
  return {
    user_id: profile.userId || "",
    email: profile.email || null,
    address: profile.address,
    lenta_store_id: profile.lentaStoreId || null,
    lenta_store_name: profile.lentaStoreName || null,
    lenta_store_address: profile.lentaStoreAddress || null,
    household_size: profile.householdSize,
    excluded_ingredients: profile.excludedIngredients,
    preferences: profile.preferences,
  };
}

function isEmptyRemoteProfile(profile: UserProfile) {
  return profile.address === ""
    && profile.householdSize === DEFAULT_PROFILE.householdSize
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
