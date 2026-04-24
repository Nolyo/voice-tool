import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { TwoFactorActivationFlow } from "@/components/auth/TwoFactorActivationFlow";
import { DevicesList } from "./DevicesList";

export function SecuritySection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { keyringAvailable } = auth;
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [showActivation, setShowActivation] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmWord = t("sync.delete_account.confirm_word");

  async function loadMfa() {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled((data?.totp?.length ?? 0) > 0);
  }

  useEffect(() => {
    loadMfa();
  }, []);

  async function disable() {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.[0];
    if (!totp) return;
    await supabase.auth.mfa.unenroll({ factorId: totp.id });
    await loadMfa();
  }

  async function onDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.rpc("request_account_deletion");
      if (error) throw error;
      await auth.signOut();
      alert(t("sync.delete_account.submitted"));
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section id="section-securite" className="space-y-4">
      <header>
        <h3 className="text-base font-semibold">{t("auth.security.sectionTitle")}</h3>
      </header>

      {!keyringAvailable && (
        <p role="alert" className="text-sm text-amber-600">
          {t("auth.security.keyringUnavailable")}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm">
          {mfaEnabled ? t("auth.security.twoFactorEnabled") : t("auth.security.twoFactorDisabled")}
        </p>
        {!mfaEnabled && !showActivation && (
          <button
            onClick={() => setShowActivation(true)}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            {t("auth.security.enable2fa")}
          </button>
        )}
        {mfaEnabled && (
          <button
            onClick={disable}
            className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90"
          >
            {t("auth.security.disable2fa")}
          </button>
        )}
        {showActivation && (
          <TwoFactorActivationFlow
            onDone={() => {
              setShowActivation(false);
              loadMfa();
            }}
            onCancel={() => setShowActivation(false)}
          />
        )}
      </div>

      <DevicesList />

      {auth.status === "signed-in" && (
        <section className="mt-6 space-y-3 rounded-md border border-destructive/40 p-4">
          <h3 className="text-sm font-semibold text-destructive">
            {t("sync.delete_account.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("sync.delete_account.description")}
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="px-3 py-2 rounded-md border border-destructive/60 text-destructive text-sm hover:bg-destructive/10"
            >
              {t("sync.delete_account.start")}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs">
                {t("sync.delete_account.confirm_prompt", { word: confirmWord })}
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmWord}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
              {deleteError && (
                <p className="text-xs text-destructive">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setConfirmText("");
                    setDeleteError(null);
                  }}
                  disabled={deleteBusy}
                  className="px-3 py-2 rounded-md border border-input text-sm hover:bg-muted disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={deleteBusy || confirmText !== confirmWord}
                  onClick={onDelete}
                  className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {deleteBusy
                    ? t("sync.delete_account.deleting")
                    : t("sync.delete_account.confirm")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
