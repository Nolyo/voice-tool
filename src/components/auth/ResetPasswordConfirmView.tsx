import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { isPwnedPassword } from "@/lib/pwned-passwords";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

export function ResetPasswordConfirmView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(
    () => (password.length === 0 ? 0 : password.length < 10 ? 1 : password.length < 14 ? 2 : 3) as 0 | 1 | 2 | 3,
    [password],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError(t("auth.signup.passwordTooShort"));
      return;
    }
    if (await isPwnedPassword(password)) {
      setError(t("auth.signup.passwordPwned"));
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(t("auth.errors.generic"));
      return;
    }
    setInfo(t("auth.passwordReset.confirmSuccess"));
    setTimeout(onDone, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.passwordReset.confirmTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.passwordReset.confirmSubtitle")}</p>
      </header>

      <input
        type="password"
        required
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
        aria-label={t("auth.signup.passwordLabel")}
      />
      <PasswordStrengthMeter score={score} />

      <button
        type="submit"
        className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        disabled={loading}
      >
        {t("auth.passwordReset.confirmSubmit")}
      </button>

      {info && <p role="status" className="text-sm text-emerald-600">{info}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
