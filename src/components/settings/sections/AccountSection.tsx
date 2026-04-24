import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { supabase } from "@/lib/supabase";
import { SyncActivationModal } from "./SyncActivationModal";
import { SyncedDataOverview } from "./SyncedDataOverview";
import { LocalBackupsList } from "./LocalBackupsList";

export function AccountSection() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const sync = useSync();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    const { error } = await supabase.rpc("request_account_deletion");
    setDeleting(false);
    if (!error) await signOut();
  }

  return (
    <section id="section-compte" className="space-y-4">
      <header>
        <h3 className="text-base font-semibold">{t("auth.account.sectionTitle")}</h3>
      </header>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("auth.account.email")}</label>
        <p className="text-sm">{user?.email}</p>
      </div>

      <button
        onClick={signOut}
        className="px-3 py-2 rounded-md border border-input text-sm hover:bg-muted"
      >
        {t("auth.logout.label")}
      </button>

      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground mb-2">
          {t("auth.account.deleteAccountWarning")}
        </p>
        {!confirmOpen ? (
          <button
            onClick={() => setConfirmOpen(true)}
            className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90"
          >
            {t("auth.account.deleteAccount")}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90 disabled:opacity-50"
              disabled={deleting}
            >
              {t("auth.logout.confirm")}
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-3 py-2 rounded-md border border-input text-sm hover:bg-muted"
            >
              {t("auth.modal.close")}
            </button>
          </div>
        )}
      </div>

      <div className="pt-6 border-t space-y-4">
        <header>
          <h3 className="text-base font-semibold">{t("sync.section_title")}</h3>
        </header>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("sync.toggle_label")}</div>
            <div className="text-xs text-muted-foreground">
              {t("sync.toggle_desc")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (sync.enabled) void sync.disableSync();
              else setActivationOpen(true);
            }}
            className="shrink-0 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            {sync.enabled ? t("sync.disable") : t("sync.enable")}
          </button>
        </div>

        {sync.enabled && (
          <>
            <SyncedDataOverview />
            <button
              type="button"
              onClick={() => void sync.syncNow()}
              className="px-3 py-2 rounded-md border border-input text-sm hover:bg-muted"
            >
              {t("sync.sync_now")}
            </button>
          </>
        )}

        <LocalBackupsList />
      </div>

      <SyncActivationModal
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
      />
    </section>
  );
}
