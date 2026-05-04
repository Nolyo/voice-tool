import "./App.css";
import Dashboard from "./components/Dashboard";
import { DeletionPendingScreen } from "./components/auth/DeletionPendingScreen";
import { CloudProvider } from "./contexts/CloudContext";
import { ProfilesProvider } from "./contexts/ProfilesContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SyncProvider } from "./contexts/SyncContext";
import { UpdaterProvider } from "./contexts/UpdaterContext";
import { Toaster } from "sonner";
import { useAuth } from "./hooks/useAuth";
import { useSettings } from "./hooks/useSettings";

function AppShell() {
  const auth = useAuth();
  const { settings } = useSettings();

  if (auth.status === "signed-in" && auth.deletionPending) {
    return <DeletionPendingScreen />;
  }

  return (
    <main>
      <Dashboard />
      <Toaster position="bottom-right" theme={settings.theme} />
    </main>
  );
}

function App() {
  return (
    <CloudProvider>
      <ProfilesProvider>
        <SettingsProvider>
          <SyncProvider>
            <UpdaterProvider>
              <AppShell />
            </UpdaterProvider>
          </SyncProvider>
        </SettingsProvider>
      </ProfilesProvider>
    </CloudProvider>
  );
}

export default App;
