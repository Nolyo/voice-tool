import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import { isPwnedPassword } from "@/lib/pwned-passwords";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

function scorePassword(p: string): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  if (p.length < 10) return 1;
  if (p.length < 14) return 2;
  return 3;
}

export function SignupView({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => scorePassword(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError(t("auth.signup.passwordTooShort"));
      return;
    }
    const pwned = await isPwnedPassword(password);
    if (pwned) {
      setError(t("auth.signup.passwordPwned"));
      return;
    }

    setLoading(true);
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setLoading(false);
    // Generic anti-enumeration reply regardless of outcome.
    setInfo(t("auth.signup.success"));
    if (signupError) {
      console.warn("signup error (not shown)", signupError.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.signup.title")}</h2>
      </header>

      <div className="space-y-1">
        <label htmlFor="su-email" className="text-sm">{t("auth.signup.emailLabel")}</label>
        <input
          id="su-email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="su-password" className="text-sm">{t("auth.signup.passwordLabel")}</label>
        <input
          id="su-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          aria-describedby="su-password-hint"
        />
        <p id="su-password-hint" className="text-xs text-muted-foreground">
          {t("auth.signup.passwordHint")}
        </p>
        <PasswordStrengthMeter score={score} />
      </div>

      <button
        type="submit"
        className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        disabled={loading}
      >
        {t("auth.signup.submit")}
      </button>

      {info && <p role="status" className="text-sm text-emerald-600">{info}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={() => onNavigate("login")}
        className="w-full text-xs underline"
      >
        {t("auth.signup.backToLogin")}
      </button>
    </form>
  );
}
