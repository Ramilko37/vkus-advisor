import { describe, expect, it } from "vitest";
import migrationSql from "../../supabase/migrations/20260829_create_profiles.sql?raw";

describe("profile migration", () => {
  it("enables RLS and scopes profile access with cached auth uid", () => {
    const sql = migrationSql.toLocaleLowerCase("en-US");

    expect(sql).toContain("create table if not exists public.profiles");
    expect(sql).toContain("alter table public.profiles enable row level security");
    expect(sql).toContain("(select auth.uid())");
    expect(sql).toContain("references auth.users(id) on delete cascade");
    expect(sql).toContain("create trigger on_auth_user_created");
  });
});
