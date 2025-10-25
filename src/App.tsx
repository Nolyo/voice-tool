import "./App.css";
import Dashboard from "./components/Dashboard";
import { SettingsProvider } from "./contexts/SettingsContext";
import { UpdaterProvider } from "./contexts/UpdaterContext";
import { Toaster } from "sonner";

function App() {
  return (
    <SettingsProvider>
      <UpdaterProvider>
        <main className="dark">
          <Dashboard />
          <Toaster position="bottom-right" theme="dark" />
        </main>
      </UpdaterProvider>
    </SettingsProvider>
  );
}

export default App;
