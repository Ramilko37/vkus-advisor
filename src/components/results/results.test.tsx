import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { BasketVariantCard } from "./BasketVariantCard";
import { ResultsHeader } from "./ResultsHeader";
import { FollowUpComposer } from "./FollowUpComposer";
import { BasketResults } from "../../components";
import type { AppError, BasketIntent, BasketItem, BasketVariant, WorkflowStage } from "../../types/domain";

const intent: BasketIntent = {
  originalRequest: "Ужины на 3 дня для двоих до 3000 ₽, без грибов",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 3000,
  maxCookingMinutes: 35,
  excludedIngredients: ["грибов"],
  preferences: [],
  readyFoodAllowed: true,
  priority: "budget",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [],
};

const items: BasketItem[] = [
  item("1", "Курица"),
  item("2", "Гречка"),
  item("3", "Овощи"),
];

const variants = [
  variant("balanced", 1000),
  variant("budget", 850),
  variant("speed", 1250),
];

afterEach(() => cleanup());

describe("ResultsHeader", () => {
  it("shows the resolved request and keeps editing separate from a new search", () => {
    const onEditRequest = vi.fn();
    const onStartNewSearch = vi.fn();
    render(<ResultsHeader intent={intent} onEditRequest={onEditRequest} onStartNewSearch={onStartNewSearch} />);

    expect(screen.getByRole("heading", { name: "3 варианта корзины" })).toBeInTheDocument();
    expect(screen.getByText("Ужины на 3 дня")).toBeInTheDocument();
    expect(screen.getByText("2 человека · до 3 000 ₽ · без грибов")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Изменить запрос" }));
    expect(onEditRequest).toHaveBeenCalledTimes(1);
    expect(onStartNewSearch).not.toHaveBeenCalled();
  });
});

describe("BasketVariantCard", () => {
  it("uses a clear comparison hierarchy and composition CTA", () => {
    render(<BasketVariantCard variant={variants[1]} variants={variants} recommended onSelect={vi.fn()} />);

    expect(screen.getByText("Экономная")).toBeInTheDocument();
    expect(screen.getByText("Рекомендуем")).toBeInTheDocument();
    expect(screen.getByText(/На 150 ₽ дешевле · 3 товара · больше готовки/)).toBeInTheDocument();
    expect(screen.getByText("Посмотреть состав")).toBeInTheDocument();
    expect(screen.queryByText(/черновик:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ ₽ к балансу/)).not.toBeInTheDocument();
  });
});


describe("FollowUpComposer", () => {
  it("inserts quick actions without submitting them", () => {
    const onSubmit = vi.fn();
    render(<FollowUpHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Дешевле" }));
    expect(screen.getByLabelText("Что изменить?")).toHaveValue("сделай дешевле");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "На больше людей" }));
    expect((screen.getByLabelText("Что изменить?") as HTMLTextAreaElement).value).toContain("3 человека");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits an explicit follow-up", () => {
    const onSubmit = vi.fn();
    render(<FollowUpHarness onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Что изменить?"), { target: { value: "убери рыбу" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));

    expect(onSubmit).toHaveBeenCalledWith("убери рыбу");
  });

  it("loads the resolved request into follow-up editing without clearing cards", async () => {
    render(
      <BasketResults
        planner={{
          state: {
            stage: "ready", messages: [], intent, variants, retailerResults: [], selectedId: null,
            error: null, catalogMode: "live", modelNames: [], pendingMessage: null,
          },
          submit: vi.fn(), retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(),
          cancel: vi.fn(), reset: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Изменить запрос" }));

    const input = screen.getByLabelText("Что изменить?");
    expect(input).toHaveValue(intent.originalRequest);
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByText("Экономная")).toBeInTheDocument();
  });

  it("keeps previous results visible next to a recoverable follow-up error", () => {
    render(
      <BasketResults
        planner={{
          state: {
            stage: "error", messages: [], intent, variants, retailerResults: [], selectedId: null,
            error: { source: "application", code: "catalog", message: "Каталог недоступен", recoverable: true },
            catalogMode: "live", modelNames: [], pendingMessage: "убери рыбу",
          },
          submit: vi.fn(), retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(),
          cancel: vi.fn(), reset: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
      />,
    );

    expect(screen.getByText("Каталог недоступен")).toBeInTheDocument();
    expect(screen.getByText("Экономная")).toBeInTheDocument();
    expect(screen.getByLabelText("Что изменить?")).toBeInTheDocument();
  });

  it("keeps the failed follow-up text available for correction", async () => {
    render(<FailedFollowUpHarness />);

    const input = screen.getByLabelText("Что изменить?");
    fireEvent.change(input, { target: { value: "убери рыбу" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));

    expect(await screen.findByText("Каталог недоступен")).toBeInTheDocument();
    expect(input).toHaveValue("убери рыбу");
  });
});

function FollowUpHarness({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return (
    <FollowUpComposer
      intent={intent}
      busy={false}
      error={null}
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      inputRef={inputRef}
    />
  );
}

function FailedFollowUpHarness() {
  const [state, setState] = useState({
    stage: "ready" as WorkflowStage, messages: [], intent, variants, retailerResults: [], selectedId: null,
    error: null as AppError | null, catalogMode: "live" as const, modelNames: [], pendingMessage: null as string | null,
  });
  const planner = {
    state,
    submit: async (message: string) => {
      setState((current) => ({
        ...current,
        stage: "error",
        error: { source: "application", code: "catalog", message: "Каталог недоступен", recoverable: true },
        pendingMessage: message,
      }));
    },
    retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(),
    cancel: vi.fn(), reset: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
  };

  return <BasketResults planner={planner as never} />;
}

function item(xmlId: string, name: string): BasketItem {
  return { id: xmlId, xmlId, name, priceRub: 100, quantity: 1, role: "main", reason: "", sourceQuery: "fixture", isDemo: false };
}

function variant(strategy: BasketVariant["strategy"], totalRub: number): BasketVariant {
  return { id: strategy, strategy, title: strategy, summary: "", tradeoffs: [], items, totalRub, uniqueItemsCount: items.length, warnings: [] };
}
