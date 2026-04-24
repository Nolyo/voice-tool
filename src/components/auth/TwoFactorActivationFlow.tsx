import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";

type Step = "scan" | "validate" | "recovery";

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

export function TwoFactorActivationFlow({ onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("scan");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // Clean up any unverified TOTP factors from previous abandoned/failed attempts,
      // otherwise they accumulate server-side (and would block enroll once Supabase's
      // per-user factor limit is reached). data.all includes unverified factors;
      // data.totp is filtered to verified only.
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
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
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

  async function handleValidate() {
    if (!factorId) return;
    setError(null);
    setLoading(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (verifyError) {
      setLoading(false);
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    // Factor is verified server-side at this point. Recovery codes MUST persist atomically;
    // otherwise rollback the factor (else user ends up with 2FA on but no recovery → lock-out risk).
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
    setStep("recovery");
  }

  async function tryStoreRecoveryCodes(codes: string[]): Promise<boolean> {
    // 3 attempts with short backoff to absorb transient RPC/network errors.
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase.rpc("store_recovery_codes", { codes });
      if (!error) return true;
      lastErr = error;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * attempt));
    }
    console.error("[2FA] store_recovery_codes failed after 3 attempts:", lastErr);
    return false;
  }

  function genCode(len: number): string {
    // 32 safe alphanumeric chars (avoid visually ambiguous 0/O, 1/I/l).
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => chars[b % chars.length]).join("");
  }

  return (
    <div className="space-y-4">
      {step === "scan" && qrCode && (
        <>
          <p className="text-sm font-medium">{t("auth.twoFactor.activation.stepScan")}</p>
          <img src={qrCode} alt="TOTP QR code" className="mx-auto w-48 h-48 bg-white p-2 rounded" />
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">
              {t("auth.twoFactor.activation.stepScanFallback")}
            </summary>
            <code className="block mt-2 text-xs font-mono break-all">{secret}</code>
          </details>
          <button
            onClick={() => setStep("validate")}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Continue
          </button>
        </>
      )}

      {step === "validate" && (
        <>
          <p className="text-sm font-medium">{t("auth.twoFactor.activation.stepValidate")}</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("auth.twoFactor.activation.codePlaceholder")}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm tracking-widest"
          />
          <button
            onClick={handleValidate}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={code.length < 6 || loading}
          >
            Continue
          </button>
        </>
      )}

      {step === "recovery" && (
        <>
          <p className="text-sm font-medium">{t("auth.twoFactor.activation.stepRecovery")}</p>
          <RecoveryCodesPanel codes={recoveryCodes} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t("auth.twoFactor.activation.ackCheckbox")}</span>
          </label>
          <button
            onClick={onDone}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={!ack}
          >
            {t("auth.twoFactor.activation.finish")}
          </button>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        onClick={onCancel}
        className="w-full px-3 py-2 rounded-md border border-input text-sm hover:bg-muted"
        type="button"
      >
        {t("auth.twoFactor.activation.cancel")}
      </button>
    </div>
  );
}
