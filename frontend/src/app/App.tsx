import { BrowserRouter } from "react-router-dom";
import { AuthGate } from "./router/AuthGate";
import { AppRouter } from "./router/AppRouter";
export { AppRouter as AppRoutes } from "./router/AppRouter";
export function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <AppRouter />
      </AuthGate>
    </BrowserRouter>
  );
}
