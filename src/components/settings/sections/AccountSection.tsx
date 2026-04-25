import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { useProfiles } from "@/contexts/ProfilesContext";
import { downloadAccountExport } from "@/lib/sync/export";
import { supabase } from "@/lib/supabase";
import { loadSnippets } from "@/lib/sync/snippets-store";
import { loadDictionary } from "@/lib/sync/dictionary-store";
import {
  listLocalBackups,
  restoreLocalBackup,
  deleteLocalBackup,
  type BackupMeta,
} from "@/lib/sync/backups";
import { TwoFactorActivationFlow } from "@/components/auth/TwoFactorActivationFlow";
import { Callout, SectionHeader, VtIcon } from "../vt";
import { SyncActivationModal } from "./SyncActivationModal";
import { DevicesList } from "./DevicesList";

const ACCENT_COMPTE = "oklch(0.72 0.17 200)";
const ACCENT_SYNC = "oklch(0.72 0.17 220)";
const ACCENT_OK = "oklch(0.72 0.14 150)";
const ACCENT_WARN = "oklch(0.78 0.14 75)";
const ACCENT_DATA = "oklch(0.7 0.02 264)";

function getInitials(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function formatRelative(iso: string | null, locale: string, fallback: string): string {
  if (!iso) return fallback;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return fallback;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffSec < 60) return rtf.format(-diffSec, "second");
  if (diffSec < 3600) return rtf.format(-Math.round(diffSec / 60), "minute");
  if (diffSec < 86400) return rtf.format(-Math.round(diffSec / 3600), "hour");
  return rtf.format(-Math.round(diffSec / 86400), "day");
}

export function AccountSection() {
  const { status } = useAuth();

  return (
    <div className="vt-fade-up space-y-5">
      {status === "signed-in" ? <SignedInBlocks /> : <SignedOutBlock />}
    </div>
  );
}

/* ─── Signed-out CTA card ──────────────────────────────────────────── */

function SignedOutBlock() {
  const { t } = useTranslation();
  const { openAuthModal } = useAuth();

  const perks: { icon: ReactNode; t: string; s: string }[] = [
    {
      icon: <VtIcon.shieldCheck />,
      t: t("auth.account.perkServerEncryption"),
      s: t("auth.account.perkServerEncryptionDesc"),
    },
    {
      icon: <VtIcon.cloud />,
      t: t("auth.account.perkOptional"),
      s: t("auth.account.perkOptionalDesc"),
    },
    {
      icon: <VtIcon.device />,
      t: t("auth.account.perkMultiDevice"),
      s: t("auth.account.perkMultiDeviceDesc"),
    },
  ];

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={ACCENT_COMPTE}
        icon={<VtIcon.cloud />}
        title={t("auth.account.sectionTitle")}
        description={t("auth.account.sectionSubtitle")}
      />
      <div className="vt-row flex flex-col items-center text-center py-12 gap-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: "oklch(from var(--vt-accent) l c h / 0.12)",
            color: "var(--vt-accent-2)",
            boxShadow: "inset 0 0 0 1px oklch(from var(--vt-accent) l c h / 0.3)",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.5 19a4.5 4.5 0 1 0-1.16-8.85A6 6 0 0 0 4.5 13.5a5 5 0 0 0 5 5.5h7.5z" />
          </svg>
        </div>
        <div className="max-w-[440px]">
          <h3 className="text-[16px] font-semibold tracking-tight">
            {t("auth.account.signedOutTitle")}
          </h3>
          <p
            className="text-[12.5px] mt-1.5 leading-relaxed"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {t("auth.account.signedOutBody")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openAuthModal("signin")} className="vt-btn-primary">
            {t("auth.account.signedOutSignIn")}
          </button>
          <button onClick={() => openAuthModal("signup")} className="vt-btn">
            {t("auth.account.signedOutCreate")}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 w-full max-w-[560px] mt-4">
          {perks.map((p, i) => (
            <div
              key={i}
              className="rounded-xl p-3 text-left"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
              }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center mb-2"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.12)",
                  color: "var(--vt-accent-2)",
                }}
              >
                {p.icon}
              </div>
              <div className="text-[12.5px] font-medium">{p.t}</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--vt-fg-3)" }}>
                {p.s}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Signed-in container ──────────────────────────────────────────── */

function SignedInBlocks() {
  return (
    <>
      <IdentityCard />
      <SyncCard />
      <SecurityCard />
      <DataCard />
      <DangerCard />
    </>
  );
}

/* ─── Identity card ────────────────────────────────────────────────── */

function IdentityCard() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const initials = getInitials(user?.email);
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={ACCENT_COMPTE}
        icon={<VtIcon.user />}
        title={t("auth.account.identityTitle")}
        description={t("auth.account.identityDesc")}
        trailing={
          <span
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium"
            style={{
              background: "var(--vt-ok-soft)",
              color: "var(--vt-ok)",
              border: "1px solid oklch(from var(--vt-ok) l c h / 0.3)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vt-ok)",
                boxShadow: "0 0 6px currentColor",
              }}
            />
            {t("auth.account.connectedBadge")}
          </span>
        }
      />
      <div
        className="vt-row grid gap-4 items-center"
        style={{ gridTemplateColumns: "64px 1fr auto" }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-semibold"
          style={{
            background: "oklch(from var(--vt-accent) l c h / 0.15)",
            color: "var(--vt-accent-2)",
            boxShadow: "inset 0 0 0 1px oklch(from var(--vt-accent) l c h / 0.35)",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium truncate" style={{ color: "var(--vt-fg)" }}>
            {user?.email ?? "—"}
          </div>
          {createdAt && (
            <div className="text-[11.5px] mt-0.5" style={{ color: "var(--vt-fg-3)" }}>
              {t("auth.account.created", {
                defaultValue: "Compte créé le {{date}}",
                date: createdAt,
              })}
            </div>
          )}
        </div>
        <button onClick={() => void signOut()} className="vt-btn">
          <VtIcon.logout />
          {t("auth.logout.label")}
        </button>
      </div>
    </div>
  );
}

/* ─── Sync card ────────────────────────────────────────────────────── */

function SyncCard() {
  const { t, i18n } = useTranslation();
  const sync = useSync();
  const { profiles, activeProfileId } = useProfiles();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const [activationOpen, setActivationOpen] = useState(false);

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={ACCENT_SYNC}
        icon={<VtIcon.cloud />}
        title={t("sync.section_title")}
        description={t("sync.toggle_desc")}
        trailing={
          <button
            type="button"
            onClick={() => {
              if (sync.enabled) void sync.disableSync();
              else setActivationOpen(true);
            }}
            className="flex items-center gap-2"
            aria-label={sync.enabled ? t("sync.disable") : t("sync.enable")}
          >
            <span className="vt-toggle" data-on={sync.enabled} />
            <span className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
              {sync.enabled
                ? t("auth.account.syncedBadge")
                : t("sync.toggle_label")}
            </span>
          </button>
        }
      />

      {sync.enabled && (
        <>
          <div className="vt-row">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "oklch(from var(--vt-ok) l c h / 0.15)",
                  color: "var(--vt-ok)",
                }}
              >
                <VtIcon.cloudCheck />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium">
                  {t("auth.account.syncedAllUpToDate")}
                </div>
                <div
                  className="text-[11.5px] vt-mono"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  {t("auth.account.syncedLastSync", {
                    when: formatRelative(
                      sync.last_sync_at,
                      i18n.language,
                      t("auth.account.lastSyncNever"),
                    ),
                  })}
                  {activeProfile && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--vt-accent-2)" }}>
                        {activeProfile.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void sync.syncNow()}
                disabled={sync.status === "syncing"}
                className="vt-btn"
              >
                {sync.status === "syncing" ? (
                  <>
                    <VtIcon.spinner />
                    {t("auth.account.syncing")}
                  </>
                ) : (
                  <>
                    <VtIcon.refresh />
                    {t("sync.sync_now")}
                  </>
                )}
              </button>
            </div>

            <SyncedInventoryGrid />
          </div>

          <div className="vt-row">
            <Callout kind="info" icon={<VtIcon.info />}>
              {t("sync.overview.not_synced_disclaimer")}
            </Callout>
            {profiles.length > 1 && activeProfile && (
              <div className="mt-3">
                <Callout kind="warn" icon={<VtIcon.alert />}>
                  {t("sync.multi_profile_warning", { name: activeProfile.name })}
                </Callout>
              </div>
            )}
          </div>

          <div className="vt-row">
            <LocalBackupsRow />
          </div>
        </>
      )}

      <SyncActivationModal
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
      />
    </div>
  );
}

function SyncedInventoryGrid() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{ snippets: number; words: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sn = (await loadSnippets()).filter((s) => s.deleted_at === null);
      const d = await loadDictionary();
      if (cancelled) return;
      setCounts({ snippets: sn.length, words: d.words.length });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items: { label: string; value: string }[] = [
    {
      label: t("settings.nav.audio", { defaultValue: "Préférences" }),
      value: t("sync.overview.scalars"),
    },
    {
      label: t("vocabulary.snippetsTitle", { defaultValue: "Snippets" }),
      value: t("sync.overview.snippets", { count: counts?.snippets ?? 0 }),
    },
    {
      label: t("vocabulary.dictionaryTitle", { defaultValue: "Dictionnaire" }),
      value: t("sync.overview.dictionary", { count: counts?.words ?? 0 }),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-lg p-3"
          style={{
            background: "var(--vt-surface)",
            border: "1px solid var(--vt-border)",
          }}
        >
          <div
            className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider mb-1"
            style={{ color: "var(--vt-fg-4)" }}
          >
            <span style={{ color: "var(--vt-ok)" }}>
              <VtIcon.check />
            </span>
            {it.label}
          </div>
          <div className="text-[12px] truncate" style={{ color: "var(--vt-fg-2)" }}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LocalBackupsRow() {
  const { t } = useTranslation();
  const [list, setList] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => setList(await listLocalBackups());

  useEffect(() => {
    void refresh();
  }, []);

  const onRestore = async (filename: string) => {
    if (!confirm(t("sync.backups.confirm_restore"))) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await restoreLocalBackup(filename);
      if (result.failed.length === 0) setMsg(t("sync.backups.restore_ok"));
      else
        setMsg(
          t("sync.backups.restore_partial", {
            failed: result.failed.map((f) => f.file).join(", "),
          }),
        );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const onDelete = async (filename: string) => {
    if (!confirm(t("sync.backups.confirm_delete"))) return;
    setBusy(true);
    try {
      await deleteLocalBackup(filename);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const latest = list[0];

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">
          {t("auth.account.localBackupsTitle")}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
          {t("auth.account.localBackupsDesc")}
        </div>
        {msg && (
          <div className="text-[11px] mt-1" style={{ color: "var(--vt-fg-3)" }}>
            {msg}
          </div>
        )}
      </div>
      {latest ? (
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="px-3 py-1.5 rounded-md vt-mono text-[11px] flex items-center gap-2 max-w-[280px] truncate"
            style={{
              background: "var(--vt-surface)",
              border: "1px solid var(--vt-border)",
              color: "var(--vt-fg-3)",
            }}
            title={latest.filename}
          >
            <VtIcon.cloud />
            <span className="truncate">{latest.filename}</span>
            <span style={{ color: "var(--vt-fg-4)" }}>
              · {(latest.size_bytes / 1024).toFixed(1)} KB
            </span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRestore(latest.filename)}
            className="vt-btn"
          >
            {t("sync.backups.restore")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(latest.filename)}
            data-tip={t("common.delete")}
            className="vt-btn"
            style={{
              color: "var(--vt-danger)",
              borderColor: "oklch(from var(--vt-danger) l c h / 0.3)",
            }}
          >
            <VtIcon.trash />
          </button>
        </div>
      ) : (
        <div className="text-[11.5px]" style={{ color: "var(--vt-fg-4)" }}>
          {t("auth.account.noBackups")}
        </div>
      )}
    </div>
  );
}

/* ─── Security card (2FA + devices) ────────────────────────────────── */

function SecurityCard() {
  const { t } = useTranslation();
  const { keyringAvailable } = useAuth();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [showActivation, setShowActivation] = useState(false);

  async function loadMfa() {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled((data?.totp?.length ?? 0) > 0);
  }

  useEffect(() => {
    void loadMfa();
  }, []);

  async function disable() {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.[0];
    if (!totp) return;
    await supabase.auth.mfa.unenroll({ factorId: totp.id });
    await loadMfa();
  }

  const accent = mfaEnabled ? ACCENT_OK : ACCENT_WARN;

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={accent}
        icon={mfaEnabled ? <VtIcon.shieldCheck /> : <VtIcon.shield />}
        title={t("auth.security.sectionTitle")}
        description={t("auth.security.sectionSubtitle")}
        trailing={
          mfaEnabled ? (
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium"
              style={{
                background: "var(--vt-ok-soft)",
                color: "var(--vt-ok)",
                border: "1px solid oklch(from var(--vt-ok) l c h / 0.3)",
              }}
            >
              <VtIcon.check /> {t("auth.security.twoFactorEnabled")}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium"
              style={{
                background: "var(--vt-warn-soft)",
                color: "var(--vt-warn)",
                border: "1px solid oklch(from var(--vt-warn) l c h / 0.3)",
              }}
            >
              <VtIcon.alert /> {t("auth.security.recommendedBadge")}
            </span>
          )
        }
      />

      {!keyringAvailable && (
        <div className="vt-row">
          <Callout kind="warn" icon={<VtIcon.alert />}>
            {t("auth.security.keyringUnavailable")}
          </Callout>
        </div>
      )}

      {!mfaEnabled && !showActivation && (
        <div className="vt-row">
          <div
            className="flex items-start gap-3 rounded-xl p-4"
            style={{
              background: "oklch(from var(--vt-warn) l c h / 0.06)",
              border: "1px solid oklch(from var(--vt-warn) l c h / 0.25)",
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "oklch(from var(--vt-warn) l c h / 0.18)",
                color: "var(--vt-warn)",
              }}
            >
              <VtIcon.shield />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[13.5px] font-semibold"
                style={{ color: "var(--vt-fg)" }}
              >
                {t("auth.security.twoFAPromptTitle")}
              </div>
              <div
                className="text-[12px] mt-1 leading-relaxed"
                style={{ color: "var(--vt-fg-2)" }}
              >
                {t("auth.security.twoFAPromptDesc")}
              </div>
              <ul
                className="text-[11.5px] mt-2 space-y-1"
                style={{ color: "var(--vt-fg-3)" }}
              >
                {[
                  t("auth.security.twoFAPerk1"),
                  t("auth.security.twoFAPerk2"),
                  t("auth.security.twoFAPerk3"),
                ].map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span style={{ color: "var(--vt-ok)" }}>•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setShowActivation(true)}
              className="vt-btn-primary shrink-0"
            >
              <VtIcon.shieldCheck />
              {t("auth.security.enable2fa")}
            </button>
          </div>
        </div>
      )}

      {showActivation && (
        <div className="vt-row">
          <TwoFactorActivationFlow
            onDone={() => {
              setShowActivation(false);
              void loadMfa();
            }}
            onCancel={() => setShowActivation(false)}
          />
        </div>
      )}

      {mfaEnabled && (
        <div className="vt-row flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: "oklch(from var(--vt-ok) l c h / 0.15)",
                color: "var(--vt-ok)",
              }}
            >
              <VtIcon.shieldCheck />
            </div>
            <div>
              <div className="text-[13px] font-medium">
                {t("auth.security.twoFAActiveTitle")}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
                {t("auth.security.twoFAActiveDesc")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={disable}
              className="vt-btn"
              style={{
                color: "var(--vt-danger)",
                borderColor: "oklch(from var(--vt-danger) l c h / 0.3)",
              }}
            >
              {t("auth.security.disable2fa")}
            </button>
          </div>
        </div>
      )}

      <div className="vt-row">
        <DevicesList />
      </div>
    </div>
  );
}

/* ─── Data export card ─────────────────────────────────────────────── */

function DataCard() {
  const { t } = useTranslation();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  async function onExport() {
    setExportBusy(true);
    setExportMsg(null);
    try {
      const path = await downloadAccountExport();
      setExportMsg(t("sync.export.saved", { path }));
    } catch (e: unknown) {
      setExportMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={ACCENT_DATA}
        icon={<VtIcon.download />}
        title={t("auth.account.exportSectionTitle")}
        description={t("auth.account.exportSectionDesc")}
      />
      <div className="vt-row flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">
            {t("auth.account.exportTitle")}
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("auth.account.exportDesc")}
          </div>
          {exportMsg && (
            <div
              className="text-[11px] mt-1 truncate"
              style={{ color: "var(--vt-fg-3)" }}
              title={exportMsg}
            >
              {exportMsg}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={exportBusy}
          className="vt-btn shrink-0"
        >
          {exportBusy ? (
            <>
              <VtIcon.spinner />
              {t("sync.export.exporting")}
            </>
          ) : (
            <>
              <VtIcon.download />
              {t("sync.export.button")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Danger zone (delete account) ─────────────────────────────────── */

function DangerCard() {
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
      if (rpcError) throw rpcError;
      await auth.signOut();
      alert(t("sync.delete_account.submitted"));
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
                <p className="text-[12px]" style={{ color: "var(--vt-danger)" }}>
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
