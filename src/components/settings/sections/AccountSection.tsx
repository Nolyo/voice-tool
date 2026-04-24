import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export function AccountSection() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    </section>
  );
}
