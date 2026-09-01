import type { FormEvent, KeyboardEvent, RefObject } from "react";
import type { AppError, BasketIntent } from "../../types/domain";
import "./results.css";

type FollowUpComposerProps = {
  intent: BasketIntent;
  busy: boolean;
  error: AppError | null;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  inputRef: RefObject<HTMLTextAreaElement>;
};

export function FollowUpComposer({ intent, busy, error, value, onChange, onSubmit, inputRef }: FollowUpComposerProps) {
  const actions = [
    { label: "Дешевле", value: "сделай дешевле" },
    { label: "Меньше готовки", value: "сделай с меньшим количеством готовки" },
    { label: "Убрать продукт", value: "убери " },
    { label: "На больше людей", value: `на ${intent.people + 1} ${peopleWord(intent.people + 1)}` },
  ];
  const canSubmit = value.trim().length > 0 && !busy;

  const insert = (fragment: string) => {
    const current = value.trimEnd();
    const next = current ? `${current}, ${fragment}` : fragment;
    onChange(next);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.length, next.length);
    });
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    void onSubmit(value.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };

  return (
    <form className="follow-up" onSubmit={submit} data-has-error={Boolean(error) || undefined}>
      <div className="follow-up__heading">
        <label htmlFor="results-follow-up">Что изменить?</label>
        <span>Уточните условия — предыдущая подборка останется до готовности новой.</span>
      </div>
      <div className="follow-up__actions" aria-label="Быстрые изменения">
        {actions.map((action) => (
          <button key={action.label} type="button" onClick={() => insert(action.value)}>{action.label}</button>
        ))}
      </div>
      <div className="follow-up__input">
        <textarea
          id="results-follow-up"
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Например: сделай дешевле, убери рыбу"
          rows={2}
          aria-invalid={Boolean(error) || undefined}
        />
        <button className="primary-button" type="submit" disabled={!canSubmit}>
          {busy ? "Применяем…" : "Применить изменения"}
        </button>
      </div>
    </form>
  );
}

function peopleWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "человека";
  return "человек";
}
