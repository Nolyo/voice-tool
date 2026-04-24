import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import type { AuthView } from "./AuthModal";

export function ResetPasswordRequestView({ onNavigate }: { onNavigate: (v: AuthView) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: AUTH_CALLBACK_URL });
    setLoading(false);
    // Anti-enumeration: always show generic success.
    setInfo(t("auth.passwordReset.success"));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.passwordReset.requestTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.passwordReset.requestSubtitle")}</p>
      </header>

      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
        aria-label={t("auth.login.magicLinkLabel")}
      />
      <button
        type="submit"
        className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        disabled={loading}
      >
        {t("auth.passwordReset.submit")}
      </button>

      {info && <p role="status" className="text-sm text-emerald-600">{info}</p>}

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
