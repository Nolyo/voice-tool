import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";

interface DeviceRow {
  id: string;
  device_fingerprint: string;
  os_name: string | null;
  app_version: string | null;
  last_seen_at: string;
}

export function DevicesList() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [thisFp, setThisFp] = useState<string | null>(null);

  async function load() {
    try {
      const fp = await invoke<string>("get_or_create_device_id");
      setThisFp(fp);
    } catch {
      // ignore
    }
    const { data } = await supabase
      .from("user_devices")
      .select("id,device_fingerprint,os_name,app_version,last_seen_at")
      .order("last_seen_at", { ascending: false });
    setDevices(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function disconnect(id: string) {
    await supabase.from("user_devices").delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("auth.security.devicesTitle")}</h4>
      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm">
            <div>
              <p>
                {d.os_name ?? "Unknown"}
                {d.app_version ? ` — ${d.app_version}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(d.last_seen_at).toLocaleString()}
                {d.device_fingerprint === thisFp && ` — ${t("auth.security.thisDevice")}`}
              </p>
            </div>
            {d.device_fingerprint !== thisFp && (
              <button onClick={() => disconnect(d.id)} className="text-xs underline">
                {t("auth.security.disconnectDevice")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
