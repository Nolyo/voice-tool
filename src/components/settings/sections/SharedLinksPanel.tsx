import { useTranslation } from "react-i18next";
import { useNoteShares } from "@/hooks/useNoteShares";
import { shareUrl } from "@/lib/sharing/slug";
import { SectionHeader, VtIcon } from "../vt";

export function SharedLinksPanel() {
  const { t } = useTranslation();
  const { shares, loading, revoke } = useNoteShares();

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color="var(--vt-accent)"
        icon={<VtIcon.share />}
        title={t("settings.sharedLinks.heading", { defaultValue: "Mes liens partagés" })}
        description={t("settings.sharedLinks.desc", { defaultValue: "Liens publics actifs pour vos notes." })}
      />

      <div className="vt-row">
        {loading ? (
          <p className="shared-links-empty">{t("settings.sharedLinks.loading", { defaultValue: "Chargement…" })}</p>
        ) : shares.length === 0 ? (
          <p className="shared-links-empty">{t("settings.sharedLinks.empty", { defaultValue: "Aucun lien actif." })}</p>
        ) : (
          <ul className="shared-links-list">
            {shares.map((s) => (
              <li key={s.id} className="shared-links-item">
                <span className="shared-links-title">{s.titleSnapshot}</span>
                <div className="shared-links-actions">
                  <button
                    type="button"
                    className="vt-btn"
                    aria-label={`${t("settings.sharedLinks.copy", { defaultValue: "Copier" })} — ${s.titleSnapshot}`}
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl(s.slug)).catch(() => {
                        // Clipboard write failed — silently ignore.
                      });
                    }}
                  >
                    {t("settings.sharedLinks.copy", { defaultValue: "Copier" })}
                  </button>
                  <button
                    type="button"
                    className="vt-btn vt-btn-danger shared-links-revoke"
                    aria-label={`${t("settings.sharedLinks.revoke", { defaultValue: "Révoquer" })} — ${s.titleSnapshot}`}
                    onClick={() => void revoke(s.id)}
                  >
                    {t("settings.sharedLinks.revoke", { defaultValue: "Révoquer" })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
