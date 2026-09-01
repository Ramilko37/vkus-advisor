import { ArrowLeft } from "lucide-react";
import type { BasketIntent } from "../../types/domain";
import { summarizeIntentLine, summarizeIntentTitle } from "../../services/requestCopy";
import "./results.css";

type ResultsHeaderProps = {
  intent: BasketIntent;
  onStartNewSearch: () => void;
  onEditRequest: () => void;
};

export function ResultsHeader({ intent, onStartNewSearch, onEditRequest }: ResultsHeaderProps) {
  return (
    <header className="results-header">
      <button className="results-header__back" type="button" onClick={onStartNewSearch}>
        <ArrowLeft size={17} aria-hidden="true" /> Новый запрос
      </button>
      <p className="section-kicker">Подборка готова</p>
      <h1>3 варианта корзины</h1>
      <div className="results-request-summary">
        <strong>{summarizeIntentTitle(intent)}</strong>
        <span>{summarizeIntentLine(intent)}</span>
      </div>
      <button className="results-header__edit" type="button" onClick={onEditRequest}>Изменить запрос</button>
    </header>
  );
}
