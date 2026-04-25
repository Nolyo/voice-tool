// src/components/settings/sections/account/DangerCard.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { purgeLocalCloudData } from "@/lib/sync/local-purge";
import { VtIcon } from "../../vt";

export function DangerCard() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmWord = t("sync.delete_account.confirm_word");

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("request_account_deletion");
      if (rpcError) {
        if (rpcError.message.includes("aal2_required")) {
          setError(t("sync.delete_account.aal2_required"));
          await auth.reevaluateMfa();
          return;
        }
        throw rpcError;
      }
      await purgeLocalCloudData();
      // Show confirmation BEFORE sign-out so the alert renders while the
      // component is still mounted. Tolerate signOut failures: the tombstone
      // is committed, local data is purged, the user is effectively logged
      // out from this device's perspective. A signOut network blip should
      // not surface as an error.
      alert(t("sync.delete_account.submitted"));
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        // ignore: tombstone is committed, local purge done, AuthContext
        // will eventually clear when session refresh fails.
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="vt-card-sectioned"
      style={{
        overflow: "hidden",
        borderColor: "oklch(from var(--vt-danger) l c h / 0.35)",
      }}
    >
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{
          borderBottom: "1px solid oklch(from var(--vt-danger) l c h / 0.25)",
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: "oklch(from var(--vt-danger) l c h / 0.15)",
            color: "var(--vt-danger)",
          }}
        >
          <VtIcon.alert />
        </div>
        <div className="flex-1">
          <h3
            className="text-[14px] font-semibold"
            style={{ color: "var(--vt-danger)" }}
          >
            {t("sync.delete_account.title")}
          </h3>
          <p className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("sync.delete_account.description")}
          </p>
        </div>
      </div>
      <div className="vt-row flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 pr-4">
          <div className="text-[13px] font-medium" style={{ color: "var(--vt-danger)" }}>
            {t("sync.delete_account.start")}
          </div>
          {!open && (
            <div className="text-[12px] mt-0.5" style={{ color: "var(--vt-fg-3)" }}>
              {t("auth.account.deleteAccountWarning")}
            </div>
          )}
          {open && (
            <div className="mt-3 space-y-2">
              <p className="text-[12px]" style={{ color: "var(--vt-fg-2)" }}>
                {t("sync.delete_account.confirm_prompt", { word: confirmWord })}
              </p>
              <input
                aria-label={t("sync.delete_account.confirm_prompt", { word: confirmWord })}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmWord}
                className="w-full h-9 px-3 rounded-md vt-mono text-[13px]"
                style={{
                  background: "var(--vt-surface)",
                  border: "1px solid var(--vt-border)",
                  color: "var(--vt-fg)",
                }}
              />
              {error && (
                <p role="alert" className="text-[12px]" style={{ color: "var(--vt-danger)" }}>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="vt-btn"
              style={{
                color: "var(--vt-danger)",
                borderColor: "oklch(from var(--vt-danger) l c h / 0.4)",
              }}
            >
              <VtIcon.trash />
              {t("sync.delete_account.start")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={busy}
                className="vt-btn"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || confirmText !== confirmWord}
                onClick={() => void onDelete()}
                className="vt-btn-primary"
                style={{ background: "var(--vt-danger)" }}
              >
                {busy
                  ? t("sync.delete_account.deleting")
                  : t("sync.delete_account.confirm")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
