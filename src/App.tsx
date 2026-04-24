import "./App.css";
import Dashboard from "./components/Dashboard";
import { ProfilesProvider } from "./contexts/ProfilesContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SyncProvider } from "./contexts/SyncContext";
import { UpdaterProvider } from "./contexts/UpdaterContext";
import { Toaster } from "sonner";
import { useSettings } from "./hooks/useSettings";

function AppShell() {
  const { settings } = useSettings();
  return (
    <main>
      <Dashboard />
      <Toaster position="bottom-right" theme={settings.theme} />
    </main>
  );
}

function App() {
  return (
    <ProfilesProvider>
      <SettingsProvider>
        <SyncProvider>
          <UpdaterProvider>
            <AppShell />
          </UpdaterProvider>
        </SyncProvider>
      </SettingsProvider>
    </ProfilesProvider>
  );
}

export default App;
