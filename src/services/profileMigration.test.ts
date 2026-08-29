import { describe, expect, it } from "vitest";
import migrationSql from "../../supabase/migrations/20260829_create_profiles.sql?raw";
import removeBasketDefaultsSql from "../../supabase/migrations/20260829_remove_profile_basket_defaults.sql?raw";

describe("profile migration", () => {
  it("enables RLS and scopes profile access with cached auth uid", () => {
    const sql = migrationSql.toLocaleLowerCase("en-US");

    expect(sql).toContain("create table if not exists public.profiles");
    expect(sql).toContain("alter table public.profiles enable row level security");
    expect(sql).toContain("(select auth.uid())");
    expect(sql).toContain("references auth.users(id) on delete cascade");
    expect(sql).toContain("create trigger on_auth_user_created");
  });

  it("removes basket-only defaults from persisted profiles", () => {
    const sql = removeBasketDefaultsSql.toLocaleLowerCase("en-US");

    expect(sql).toContain("drop column if exists default_days");
    expect(sql).toContain("drop column if exists default_budget_rub");
  });
});
