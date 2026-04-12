import "./App.css";
import Dashboard from "./components/Dashboard";
import { ProfilesProvider } from "./contexts/ProfilesContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { UpdaterProvider } from "./contexts/UpdaterContext";
import { Toaster } from "sonner";

function App() {
  return (
    <ProfilesProvider>
      <SettingsProvider>
        <UpdaterProvider>
          <main className="dark">
            <Dashboard />
            <Toaster position="bottom-right" theme="dark" />
          </main>
        </UpdaterProvider>
      </SettingsProvider>
    </ProfilesProvider>
  );
}

export default App;
