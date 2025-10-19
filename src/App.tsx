import "./App.css";
import Dashboard from "./components/dashboard";
import { SettingsProvider } from "./contexts/SettingsContext";

function App() {
  return (
    <SettingsProvider>
      <main className="dark">
        <Dashboard />
      </main>
    </SettingsProvider>
  );
}

export default App;
