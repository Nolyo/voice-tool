import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export function DeletionPendingScreen() {
  const { t, i18n } = useTranslation();
  const { deletionPending, refreshDeletionPending, signOut, reevaluateMfa } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!deletionPending) return null;

  const requestedDate = new Date(deletionPending.requestedAt);
  const purgeDate = new Date(deletionPending.purgeAt);
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const remainingDays = Math.max(
    0,
    Math.ceil((purgeDate.getTime() - Date.now()) / (24 * 3600 * 1000)),
  );

  async function onCancel() {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("cancel_account_deletion");
      if (rpcError) {
        if (rpcError.message.includes("aal2_required")) {
          setError(t("auth.deletion_pending.aal2_required"));
          await reevaluateMfa();
          return;
        }
        throw rpcError;
      }
      await refreshDeletionPending();
    } catch (e: unknown) {
      setError(
        t("auth.deletion_pending.cancel_error", {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vt-app min-h-screen flex items-center justify-center p-8">
      <div
        className="vt-card-sectioned max-w-[520px] w-full"
        style={{
          borderColor: "oklch(from var(--vt-danger) l c h / 0.4)",
        }}
      >
        <div
          className="px-6 py-5 flex items-start gap-3"
          style={{
            borderBottom: "1px solid oklch(from var(--vt-danger) l c h / 0.25)",
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "oklch(from var(--vt-danger) l c h / 0.15)",
              color: "var(--vt-danger)",
            }}
            aria-hidden
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1
              className="text-[18px] font-semibold"
              style={{ color: "var(--vt-danger)" }}
            >
              {t("auth.deletion_pending.title")}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--vt-fg-2)" }}>
              {t("auth.deletion_pending.headline")}
            </p>
          </div>
        </div>

        <div
          className="px-6 py-5 space-y-3 text-[13px]"
          style={{ color: "var(--vt-fg-2)" }}
        >
          <p>
            {t("auth.deletion_pending.requested_at", {
              date: dateFmt.format(requestedDate),
            })}
          </p>
          <p>
            {t("auth.deletion_pending.purge_at", { date: dateFmt.format(purgeDate) })}
            {" — "}
            <span style={{ color: "var(--vt-warn)" }}>
              {t("auth.deletion_pending.remaining", { count: remainingDays })}
            </span>
          </p>
          {error && (
            <p
              role="alert"
              className="text-[12px]"
              style={{ color: "var(--vt-danger)" }}
            >
              {error}
            </p>
          )}
        </div>

        <div
          className="px-6 py-4 flex flex-wrap items-center gap-2 justify-end"
          style={{ borderTop: "1px solid var(--vt-border)" }}
        >
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="vt-btn"
          >
            {t("auth.deletion_pending.local_mode")}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="vt-btn"
          >
            {t("auth.deletion_pending.signout")}
          </button>
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            className="vt-btn-primary"
          >
            {busy
              ? t("auth.deletion_pending.cancel_busy")
              : t("auth.deletion_pending.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
