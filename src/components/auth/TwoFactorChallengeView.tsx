import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { VtIcon } from "@/components/settings/vt";
import { OtpInput } from "./OtpInput";

type Mode = "totp" | "recovery";

export function TwoFactorChallengeView() {
  const { t } = useTranslation();
  const { mfaChallenge, reevaluateMfa } = useAuth();
  const [mode, setMode] = useState<Mode>("totp");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === "recovery") {
      const trimmed = recoveryCode.trim();
      const { data, error: fnError } = await supabase.functions.invoke<{ ok?: boolean }>(
        "consume-recovery-code",
        { body: { code: trimmed } },
      );
      setLoading(false);
      if (fnError || !data?.ok) {
        setError(t("auth.errors.invalidRecoveryCode"));
        return;
      }
      setInfo(t("auth.twoFactor.challenge.recoverySuccess"));
      await reevaluateMfa();
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaChallenge.factorId,
      code: totpCode,
    });
    setLoading(false);
    if (verifyError) {
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    await reevaluateMfa();
  }

  const submitDisabled =
    loading ||
    (mode === "totp" ? totpCode.length < 6 : recoveryCode.trim().length < 6);

  return (
    <div
      className="rounded-xl overflow-hidden vt-anim-fade-up"
      style={{
        background: "var(--vt-panel)",
        border: "1px solid var(--vt-border)",
      }}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "oklch(from var(--vt-accent) l c h / 0.15)",
              color: "var(--vt-accent)",
              boxShadow:
                "inset 0 0 0 1px oklch(from var(--vt-accent) l c h / 0.35)",
            }}
          >
            <VtIcon.shieldCheck />
          </div>
          <div>
            <div className="vt-display text-[15px] font-semibold tracking-tight">
              {t("auth.twoFactor.challenge.title")}
            </div>
            <div
              className="text-[11.5px]"
              style={{ color: "var(--vt-fg-3)" }}
            >
              {mode === "totp"
                ? t("auth.twoFactor.challenge.subtitle")
                : t("auth.twoFactor.challenge.recoverySubtitle", {
                    defaultValue:
                      "Saisis l'un de tes codes de récupération pour reprendre la main.",
                  })}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-5 pb-5">
        {mode === "totp" ? (
          <>
            <OtpInput
              value={totpCode}
              onChange={setTotpCode}
              autoFocus
              disabled={loading}
              ariaLabel={t("auth.twoFactor.challenge.totpPlaceholder", {
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
          </>
        ) : (
          <div className="my-6">
            <input
              type="text"
              autoComplete="one-time-code"
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder={t("auth.twoFactor.challenge.recoveryPlaceholder", {
                defaultValue: "Code de récupération",
              })}
              aria-label={t("auth.twoFactor.challenge.recoveryPlaceholder", {
                defaultValue: "Code de récupération",
              })}
              disabled={loading}
              className="vt-auth-recovery-input w-full h-[52px] rounded-[10px] px-4 text-center vt-mono text-[18px] tracking-[0.2em] uppercase transition disabled:opacity-50"
              style={{
                background: recoveryCode
                  ? "oklch(from var(--vt-accent) l c h / 0.08)"
                  : "var(--vt-surface)",
                border:
                  "1px solid " +
                  (recoveryCode
                    ? "oklch(from var(--vt-accent) l c h / 0.4)"
                    : "var(--vt-border)"),
                color: "var(--vt-fg)",
                caretColor: "var(--vt-accent)",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px oklch(from var(--vt-accent) l c h / 0.25)";
                e.currentTarget.style.borderColor = "var(--vt-accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = recoveryCode
                  ? "oklch(from var(--vt-accent) l c h / 0.4)"
                  : "var(--vt-border)";
              }}
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-[12px] mt-3 text-center"
            style={{ color: "var(--vt-danger)" }}
          >
            {error}
          </p>
        )}
        {info && (
          <p
            role="status"
            className="text-[12px] mt-3 text-center"
            style={{ color: "var(--vt-ok)" }}
          >
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="vt-btn-primary w-full justify-center mt-6"
        >
          {loading ? (
            <VtIcon.spinner />
          ) : (
            t("auth.twoFactor.challenge.submit")
          )}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => switchMode(mode === "totp" ? "recovery" : "totp")}
            className="text-[11.5px] underline-offset-2 hover:underline"
            style={{ color: "var(--vt-fg-3)" }}
            disabled={loading}
          >
            {mode === "totp"
              ? t("auth.twoFactor.challenge.useRecoveryCode", {
                  defaultValue: "Utiliser un code de récupération",
                })
              : t("auth.twoFactor.challenge.useTotp", {
                  defaultValue: "Utiliser un code TOTP",
                })}
          </button>
        </div>
      </form>
    </div>
  );
}
