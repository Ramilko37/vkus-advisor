import { AppShell, BasketResults, ConversationPanel } from "./components";
import { useBasketPlanner } from "./hooks/useBasketPlanner";

export function App() {
  const planner = useBasketPlanner();

  return (
    <AppShell
      conversation={<ConversationPanel planner={planner} />}
      results={<BasketResults planner={planner} />}
    />
  );
}
