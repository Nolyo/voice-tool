import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

export function LoginView({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signinError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setLoading(false);
    // Generic anti-enumeration reply regardless of outcome.
    setInfo(t("auth.login.magicLinkSuccess"));
    if (signinError) {
      // Only log for debug — don't surface enumeration-leaking errors.
      console.warn("magic link error (not shown to user)", signinError.message);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      const nonce = await invoke<string>("generate_oauth_state");
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: AUTH_CALLBACK_URL,
          queryParams: { state: nonce, access_type: "offline", prompt: "consent" },
          skipBrowserRedirect: true,
        },
      });
      if (oauthError || !data.url) throw oauthError ?? new Error("no oauth url");
      // Open the OAuth URL in the default browser — the user returns via deep link.
      await openUrl(data.url);
    } catch (e) {
      setError(t("auth.errors.generic"));
      console.error("oauth start failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (loginError) {
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    if (data.session) {
      // MFA: if the user has TOTP enrolled, Supabase flags aal2 as the next assurance level.
      const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mfaData && mfaData.nextLevel === "aal2" && mfaData.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp) {
          const evt = new CustomEvent("auth:mfa-required", { detail: { factorId: totp.id } });
          window.dispatchEvent(evt);
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.login.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
      </header>

      {!showPasswordForm && (
        <>
          <form onSubmit={handleMagicLink} className="space-y-2">
            <label htmlFor="login-email" className="text-sm">
              {t("auth.login.magicLinkLabel")}
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.magicLinkPlaceholder")}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              disabled={loading || !email}
            >
              {t("auth.login.magicLinkSubmit")}
            </button>
          </form>

          <div className="text-center text-xs text-muted-foreground">— or —</div>

          <button
            onClick={handleGoogle}
            className="w-full px-3 py-2 rounded-md border border-input text-sm hover:bg-muted disabled:opacity-50"
            disabled={loading}
          >
            {t("auth.login.oauthGoogle")}
          </button>

          <button
            onClick={() => setShowPasswordForm(true)}
            className="w-full text-xs text-muted-foreground underline"
            type="button"
          >
            {t("auth.login.emailPasswordToggle")}
          </button>
        </>
      )}

      {showPasswordForm && (
        <form onSubmit={handlePasswordLogin} className="space-y-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.login.magicLinkPlaceholder")}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            disabled={loading}
            aria-label={t("auth.login.magicLinkLabel")}
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            disabled={loading}
            aria-label={t("auth.signup.passwordLabel")}
          />
          <button
            type="submit"
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={loading}
          >
            {t("auth.login.emailPasswordToggle")}
          </button>
          <button
            type="button"
            onClick={() => onNavigate("reset-request")}
            className="w-full text-xs underline"
          >
            {t("auth.login.forgotPassword")}
          </button>
        </form>
      )}

      {info && <p role="status" aria-live="polite" className="text-sm text-emerald-600">{info}</p>}
      {error && <p role="alert" aria-live="assertive" className="text-sm text-red-600">{error}</p>}

      <p className="text-center text-xs">
        <button onClick={() => onNavigate("signup")} className="underline">
          {t("auth.login.switchToSignup")}
        </button>
      </p>
    </div>
  );
}
