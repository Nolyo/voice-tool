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

const DeviceIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffSec < 60) return rtf.format(-diffSec, "second");
  if (diffSec < 3600) return rtf.format(-Math.round(diffSec / 60), "minute");
  if (diffSec < 86400) return rtf.format(-Math.round(diffSec / 3600), "hour");
  return rtf.format(-Math.round(diffSec / 86400), "day");
}

export function DevicesList() {
  const { t, i18n } = useTranslation();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [thisFp, setThisFp] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const fp = await invoke<string>("get_or_create_device_id");
      setThisFp(fp);
    } catch {
      // ignore — fingerprint may not be available in dev/web
    }
    const { data } = await supabase
      .from("user_devices")
      .select("id,device_fingerprint,os_name,app_version,last_seen_at")
      .order("last_seen_at", { ascending: false });
    setDevices(data ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function disconnect(id: string) {
    await supabase.from("user_devices").delete().eq("id", id);
    await load();
  }

  async function disconnectAllOthers() {
    if (!thisFp) return;
    const ids = devices
      .filter((d) => d.device_fingerprint !== thisFp)
      .map((d) => d.id);
    if (ids.length === 0) return;
    await supabase.from("user_devices").delete().in("id", ids);
    await load();
  }

  const otherDevicesCount = devices.filter(
    (d) => d.device_fingerprint !== thisFp,
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] font-medium">
            {t("auth.security.devicesTitle")}
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("auth.security.devicesSubtitle", {
              defaultValue: "Sessions actuellement autorisées à synchroniser.",
            })}
          </div>
        </div>
        {otherDevicesCount > 0 && (
          <button
            type="button"
            onClick={disconnectAllOthers}
            className="vt-btn vt-btn-sm"
            style={{
              color: "var(--vt-danger)",
              borderColor: "oklch(from var(--vt-danger) l c h / 0.3)",
            }}
          >
            {t("auth.security.revokeAllOthers", {
              defaultValue: "Révoquer tous sauf celui-ci",
            })}
          </button>
        )}
      </div>

      {loaded && devices.length === 0 ? (
        <div
          className="rounded-xl px-4 py-6 text-center text-[12px]"
          style={{
            background: "var(--vt-surface)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-fg-3)",
          }}
        >
          {t("auth.security.noDevices", {
            defaultValue: "Aucun appareil enregistré.",
          })}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: "1px solid var(--vt-border)",
            background: "var(--vt-surface)",
          }}
        >
          {devices.map((d, i) => {
            const current = d.device_fingerprint === thisFp;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-3.5 py-3"
                style={
                  i > 0 ? { borderTop: "1px solid var(--vt-border)" } : undefined
                }
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: "oklch(1 0 0 / 0.04)",
                    color: "var(--vt-fg-2)",
                    border: "1px solid var(--vt-border)",
                  }}
                >
                  <DeviceIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">
                      {d.os_name ?? t("auth.security.unknownOs", { defaultValue: "Appareil inconnu" })}
                      {d.app_version ? ` · ${d.app_version}` : ""}
                    </span>
                    {current && (
                      <span
                        className="vt-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: "oklch(from var(--vt-accent) l c h / 0.18)",
                          color: "var(--vt-accent-2)",
                        }}
                      >
                        {t("auth.security.thisDevice")}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[11.5px]"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    <span className="vt-mono">
                      {formatRelative(d.last_seen_at, i18n.language)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(d.id)}
                  disabled={current}
                  className="vt-btn vt-btn-sm"
                  style={
                    current
                      ? { opacity: 0.4, cursor: "not-allowed" }
                      : {
                          color: "var(--vt-danger)",
                          borderColor: "oklch(from var(--vt-danger) l c h / 0.3)",
                        }
                  }
                >
                  {current ? "—" : t("auth.security.disconnectDevice")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
