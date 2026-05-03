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
    <form onSubmit={handleSubmit} className="space-y-4 vt-anim-fade-up">
      <header>
        <h2 className="vt-display text-[15px] font-semibold tracking-tight">
          {t("auth.passwordReset.requestTitle")}
        </h2>
        <p className="text-[12px] mt-1" style={{ color: "var(--vt-fg-3)" }}>
          {t("auth.passwordReset.requestSubtitle")}
        </p>
      </header>

      <div>
        <label
          className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block"
          style={{ color: "var(--vt-fg-4)" }}
          htmlFor="reset-email"
        >
          {t("auth.login.magicLinkLabel")}
        </label>
        <input
          id="reset-email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label={t("auth.login.magicLinkLabel")}
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

      <button
        type="submit"
        className="vt-btn-primary w-full justify-center"
        disabled={loading || !email}
      >
        {t("auth.passwordReset.submit")}
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

      <button
        type="button"
        onClick={() => onNavigate("signin")}
        className="w-full text-[12px] underline"
        style={{ color: "var(--vt-fg-3)" }}
      >
        {t("auth.signup.backToLogin")}
      </button>
    </form>
  );
}
