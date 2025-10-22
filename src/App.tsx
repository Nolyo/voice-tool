import "./App.css";
import Dashboard from "./components/dashboard";
import { SettingsProvider } from "./contexts/SettingsContext";
import { Toaster } from "sonner";

function App() {
  return (
    <SettingsProvider>
      <main className="dark">
        <Dashboard />
        <Toaster position="bottom-right" theme="dark" />
      </main>
    </SettingsProvider>
  );
}

export default App;
