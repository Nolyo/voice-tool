import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { isPwnedPassword } from "@/lib/pwned-passwords";
import { useAuth } from "@/hooks/useAuth";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

export function ResetPasswordConfirmView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { reevaluateMfa } = useAuth();
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
    // Now that password is set, enforce MFA if user has it enabled.
    await reevaluateMfa();
    setTimeout(onDone, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 vt-anim-fade-up">
      <header>
        <h2 className="vt-display text-[15px] font-semibold tracking-tight">
          {t("auth.passwordReset.confirmTitle")}
        </h2>
        <p className="text-[12px] mt-1" style={{ color: "var(--vt-fg-3)" }}>
          {t("auth.passwordReset.confirmSubtitle")}
        </p>
      </header>

      <div>
        <label
          className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block"
          style={{ color: "var(--vt-fg-4)" }}
          htmlFor="reset-password"
        >
          {t("auth.signup.passwordLabel")}
        </label>
        <input
          id="reset-password"
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label={t("auth.signup.passwordLabel")}
          disabled={loading}
          className="w-full h-9 px-3 rounded-md text-[13px] outline-none transition disabled:opacity-50"
          style={{
            background: "var(--vt-surface)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-fg)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow =
              "0 0 0 3px oklch(from var(--vt-accent) l c h / 0.25)";
            e.currentTarget.style.borderColor = "var(--vt-accent)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.borderColor = "var(--vt-border)";
          }}
        />
      </div>

      <PasswordStrengthMeter score={score} />

      <button
        type="submit"
        className="vt-btn-primary w-full justify-center"
        disabled={loading || !password}
      >
        {t("auth.passwordReset.confirmSubmit")}
      </button>

      {info && (
        <p
          role="status"
          className="text-[12px] text-center"
          style={{ color: "var(--vt-ok)" }}
        >
          {info}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-[12px] text-center"
          style={{ color: "var(--vt-danger)" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
