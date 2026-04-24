import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export function TwoFactorChallengeView() {
  const { t } = useTranslation();
  const { mfaChallenge, setMfaChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setLoading(true);
    setError(null);
    const trimmed = code.trim();
    const isRecovery = !/^\d{6}$/.test(trimmed);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaChallenge.factorId,
      code: trimmed,
    });
    setLoading(false);
    if (verifyError) {
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    setMfaChallenge(null);
    if (isRecovery) {
      // Fire a notification email reminder — handled by Supabase trigger (Task 20) later.
      console.info("recovery code consumed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.twoFactor.challenge.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.twoFactor.challenge.subtitle")}</p>
      </header>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("auth.twoFactor.challenge.placeholder")}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm tracking-widest"
        aria-label={t("auth.twoFactor.challenge.placeholder")}
      />
      <button
        type="submit"
        className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        disabled={loading || code.length < 6}
      >
        {t("auth.twoFactor.challenge.submit")}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
