import { useTranslation } from "react-i18next";
import { useNoteShares } from "@/hooks/useNoteShares";
import { shareUrl } from "@/lib/sharing/slug";

export function SharedLinksPanel() {
  const { t } = useTranslation();
  const { shares, loading, revoke } = useNoteShares();

  return (
    <section className="settings-block">
      <h3 className="settings-block-title">
        {t("settings.sharedLinks.heading", { defaultValue: "Mes liens partagés" })}
      </h3>

      {loading ? (
        <p className="settings-muted">{t("settings.sharedLinks.loading", { defaultValue: "Chargement…" })}</p>
      ) : shares.length === 0 ? (
        <p className="settings-muted">{t("settings.sharedLinks.empty", { defaultValue: "Aucun lien actif." })}</p>
      ) : (
        <ul className="shared-links-list">
          {shares.map((s) => (
            <li key={s.id} className="shared-links-item">
              <span className="shared-links-title truncate">{s.titleSnapshot}</span>
              <div className="shared-links-actions">
                <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl(s.slug))}>
                  {t("settings.sharedLinks.copy", { defaultValue: "Copier" })}
                </button>
                <button type="button" className="shared-links-revoke" onClick={() => void revoke(s.id)}>
                  {t("settings.sharedLinks.revoke", { defaultValue: "Révoquer" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
