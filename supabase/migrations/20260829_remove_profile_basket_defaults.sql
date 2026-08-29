alter table public.profiles
  drop column if exists default_days,
  drop column if exists default_budget_rub;
