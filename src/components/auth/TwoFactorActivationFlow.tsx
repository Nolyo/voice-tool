import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { supabase } from "@/lib/supabase";
import { Callout, VtIcon } from "@/components/settings/vt";
import { OtpInput } from "./OtpInput";

type Step = 1 | 2 | 3;

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

const ArrowIcon = () => (
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
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const PrintIcon = () => (
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
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const CopyIcon = () => (
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
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function genCode(len: number): string {
  // 32 unambiguous alphanumeric chars (avoids 0/O, 1/I/l).
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

export function TwoFactorActivationFlow({ onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      // Clean up any unverified TOTP factors from previous abandoned attempts.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = (existing?.all ?? []).filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      );
      await Promise.all(
        stale.map((f) =>
          supabase.auth.mfa.unenroll({ factorId: f.id }).catch((e) =>
            console.warn("[2FA] stale factor cleanup failed", e),
          ),
        ),
      );
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrollError || !data) {
        console.error("[2FA] enroll failed:", enrollError);
        setError(t("auth.errors.generic"));
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify() {
    if (!factorId) return;
    if (code.length < 6) return;
    setError(null);
    setLoading(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (verifyError) {
      setLoading(false);
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    // Recovery codes MUST persist atomically; rollback factor if storage fails.
    const codes = Array.from({ length: 10 }, () => genCode(8));
    const stored = await tryStoreRecoveryCodes(codes);
    if (!stored) {
      const { error: rollbackErr } = await supabase.auth.mfa.unenroll({ factorId });
      if (rollbackErr) console.error("[2FA] rollback unenroll failed:", rollbackErr);
      setLoading(false);
      setError(t("auth.errors.generic"));
      return;
    }
    setLoading(false);
    setRecoveryCodes(codes);
    setStep(3);
  }

  async function tryStoreRecoveryCodes(codes: string[]): Promise<boolean> {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: rpcErr } = await supabase.rpc("store_recovery_codes", { codes });
      if (!rpcErr) return true;
      lastErr = rpcErr;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * attempt));
    }
    console.error("[2FA] store_recovery_codes failed after 3 attempts:", lastErr);
    return false;
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await writeText(secret);
    } catch {
      // ignore — keyring/clipboard may be unavailable
    }
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 1500);
  }

  async function copyAllCodes() {
    try {
      await writeText(recoveryCodes.join("\n"));
    } catch {
      // ignore
    }
  }

  function downloadCodes() {
    const blob = new Blob([recoveryCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lexena-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function printCodes() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(`
      <html>
        <head><title>Lexena — recovery codes</title></head>
        <body style="font-family: -apple-system, system-ui, sans-serif; padding: 24px;">
          <h2 style="margin-top: 0;">Lexena — recovery codes</h2>
          <p style="color: #555;">${t("auth.twoFactor.activation.recoveryWarning")}</p>
          <pre style="font-size: 14px; line-height: 2; letter-spacing: .05em;">${recoveryCodes.join("\n")}</pre>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  const codeFilled = code.length === 6;

  const stepLabels = [
    t("auth.twoFactor.activation.stepLabelScan", { defaultValue: "Scanner" }),
    t("auth.twoFactor.activation.stepLabelVerify", { defaultValue: "Vérifier" }),
    t("auth.twoFactor.activation.stepLabelBackup", { defaultValue: "Sauvegarder" }),
  ];

  return (
    <div
      className="rounded-xl overflow-hidden vt-anim-fade-up"
      style={{
        background: "var(--vt-panel)",
        border: "1px solid var(--vt-border)",
      }}
    >
      {/* Header with stepper */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "oklch(from var(--vt-ok) l c h / 0.15)",
                color: "var(--vt-ok)",
                boxShadow: "inset 0 0 0 1px oklch(from var(--vt-ok) l c h / 0.35)",
              }}
            >
              <VtIcon.shieldCheck />
            </div>
            <div>
              <div className="vt-display text-[15px] font-semibold tracking-tight">
                {t("auth.security.enable2fa")}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
                {t("auth.twoFactor.activation.stepCounter", {
                  defaultValue: "Étape {{step}} sur 3",
                  step,
                })}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--vt-surface)]"
            style={{ color: "var(--vt-fg-3)" }}
            aria-label={t("auth.twoFactor.activation.cancel")}
          >
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n, i) => {
            const reached = step >= n;
            const completed = step > n;
            return (
              <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition"
                    style={
                      reached
                        ? { background: "var(--vt-accent)", color: "white" }
                        : {
                            background: "var(--vt-surface)",
                            color: "var(--vt-fg-4)",
                            border: "1px solid var(--vt-border)",
                          }
                    }
                  >
                    {completed ? <VtIcon.check /> : n}
                  </div>
                  <span
                    className="text-[11px]"
                    style={{ color: reached ? "var(--vt-fg-2)" : "var(--vt-fg-4)" }}
                  >
                    {stepLabels[i]}
                  </span>
                </div>
                {n < 3 && (
                  <div
                    className="flex-1 h-px"
                    style={{
                      background: completed
                        ? "var(--vt-accent)"
                        : "var(--vt-border)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        {step === 1 && (
          <div className="vt-anim-fade-up">
            <p
              className="text-[12.5px] leading-relaxed mb-4"
              style={{ color: "var(--vt-fg-2)" }}
            >
              {t("auth.twoFactor.activation.scanIntro", {
                defaultValue:
                  "Ouvre ton application d'authentification et scanne ce QR code, ou colle la clé manuellement.",
              })}
            </p>

            <div className="flex gap-4">
              <div
                className="shrink-0 rounded-xl bg-white p-3"
                style={{
                  boxShadow:
                    "0 0 0 1px var(--vt-border), 0 12px 32px -8px rgba(0,0,0,.5)",
                }}
              >
                {qrCode ? (
                  <img
                    src={qrCode}
                    alt="TOTP QR code"
                    className="w-[168px] h-[168px] block"
                  />
                ) : (
                  <div
                    className="w-[168px] h-[168px] flex items-center justify-center text-xs"
                    style={{
                      background: "var(--vt-surface)",
                      color: "var(--vt-fg-4)",
                    }}
                  >
                    …
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div>
                  <div
                    className="text-[10.5px] uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--vt-fg-4)" }}
                  >
                    {t("auth.twoFactor.activation.secretKeyLabel", {
                      defaultValue: "Clé secrète",
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copySecret()}
                    className="w-full text-left px-3 py-2 rounded-md vt-mono text-[12px] flex items-center justify-between transition"
                    style={{
                      background: "var(--vt-surface)",
                      border: "1px solid var(--vt-border)",
                    }}
                  >
                    <span className="truncate" style={{ color: "var(--vt-fg)" }}>
                      {secret ?? "…"}
                    </span>
                    <span
                      className="flex items-center gap-1 text-[10.5px] shrink-0 ml-2"
                      style={{
                        color: secretCopied ? "var(--vt-ok)" : "var(--vt-fg-3)",
                      }}
                    >
                      {secretCopied ? (
                        <>
                          <VtIcon.check />
                          {t("auth.twoFactor.activation.copied", {
                            defaultValue: "Copié",
                          })}
                        </>
                      ) : (
                        <>
                          <CopyIcon />
                          {t("auth.twoFactor.activation.copy", {
                            defaultValue: "Copier",
                          })}
                        </>
                      )}
                    </span>
                  </button>
                </div>
                <div>
                  <div
                    className="text-[10.5px] uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--vt-fg-4)" }}
                  >
                    {t("auth.twoFactor.activation.recommendedApps", {
                      defaultValue: "Apps recommandées",
                    })}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {["1Password", "Authy", "Google Authenticator"].map((a) => (
                      <div
                        key={a}
                        className="flex items-center gap-2 text-[11.5px] px-2.5 py-1.5 rounded-md"
                        style={{
                          background: "var(--vt-surface)",
                          border: "1px solid var(--vt-border)",
                          color: "var(--vt-fg-2)",
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: "var(--vt-fg-4)" }}
                        />
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p
                className="text-[12px] mt-4 text-center"
                style={{ color: "var(--vt-danger)" }}
              >
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 mt-5">
              <button
                type="button"
                onClick={onCancel}
                className="vt-btn flex-1 justify-center"
              >
                {t("auth.twoFactor.activation.cancel")}
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!qrCode}
                className="vt-btn-primary flex-1 justify-center"
              >
                {t("auth.twoFactor.activation.scannedContinue", {
                  defaultValue: "J'ai scanné, continuer",
                })}
                <ArrowIcon />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="vt-anim-fade-up">
            <p
              className="text-[12.5px] leading-relaxed mb-4"
              style={{ color: "var(--vt-fg-2)" }}
            >
              {t("auth.twoFactor.activation.verifyIntro", {
                defaultValue:
                  "Saisis le code à 6 chiffres affiché par ton application d'authentification.",
              })}
            </p>
            <OtpInput
              value={code}
              onChange={setCode}
              autoFocus
              disabled={loading}
              ariaLabel={t("auth.twoFactor.activation.codePlaceholder", {
                defaultValue: "Code à 6 chiffres",
              })}
            />
            <div
              className="text-center text-[11.5px]"
              style={{ color: "var(--vt-fg-3)" }}
            >
              {t("auth.twoFactor.activation.codeRotates", {
                defaultValue: "Le code change toutes les 30 s.",
              })}
            </div>

            {error && (
              <p
                className="text-[12px] mt-3 text-center"
                style={{ color: "var(--vt-danger)" }}
              >
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="vt-btn flex-1 justify-center"
                disabled={loading}
              >
                {t("common.previous", { defaultValue: "Précédent" })}
              </button>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={!codeFilled || loading}
                className="vt-btn-primary flex-1 justify-center"
              >
                {loading ? (
                  <VtIcon.spinner />
                ) : (
                  <>
                    {t("auth.twoFactor.activation.verify", {
                      defaultValue: "Vérifier",
                    })}
                    <ArrowIcon />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="vt-anim-fade-up">
            <Callout
              kind="warn"
              icon={<VtIcon.alert />}
              title={t("auth.twoFactor.activation.saveCodesNow", {
                defaultValue: "Sauvegarde tes codes maintenant",
              })}
            >
              {t("auth.twoFactor.activation.recoveryWarning")}
            </Callout>

            <div className="grid grid-cols-2 gap-2 my-4">
              {recoveryCodes.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-2.5 text-center vt-mono text-[13px] tracking-wider"
                  style={{
                    background: "var(--vt-surface)",
                    border: "1px solid var(--vt-border)",
                    color: "var(--vt-fg-2)",
                  }}
                >
                  {c}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadCodes}
                className="vt-btn flex-1 justify-center"
              >
                <VtIcon.download />
                {t("auth.twoFactor.activation.download")}
              </button>
              <button
                type="button"
                onClick={printCodes}
                className="vt-btn flex-1 justify-center"
              >
                <PrintIcon />
                {t("auth.twoFactor.activation.print", { defaultValue: "Imprimer" })}
              </button>
              <button
                type="button"
                onClick={() => void copyAllCodes()}
                className="vt-btn flex-1 justify-center"
              >
                <CopyIcon />
                {t("auth.twoFactor.activation.copyAll")}
              </button>
            </div>

            <button
              type="button"
              onClick={onDone}
              className="vt-btn-primary w-full justify-center mt-4"
            >
              <VtIcon.shieldCheck />
              {t("auth.twoFactor.activation.savedFinish", {
                defaultValue: "J'ai sauvegardé mes codes — terminer",
              })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
