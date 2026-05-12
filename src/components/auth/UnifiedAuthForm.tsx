import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import { isDisposableDomain } from "@/lib/email-normalize";
import { VtIcon } from "@/components/settings/vt";
import { TurnstileWidget } from "./TurnstileWidget";
import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

type Step = "form" | "sent";

const GoogleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
    />
  </svg>
);

const LockIcon = () => (
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
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: open ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 150ms ease",
    }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export function UnifiedAuthForm({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isDisposableDomain(email)) {
      setError(t("auth.signup.emailDisposable"));
      return;
    }
    if (!captchaToken) {
      setError(t("auth.signup.captchaRequired"));
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: AUTH_CALLBACK_URL,
        captchaToken,
        shouldCreateUser: true,
      },
    });
    setLoading(false);
    setCaptchaToken(null);
    // Anti-enumeration : same outcome whether the account exists or not.
    setStep("sent");
    if (otpError) {
      console.warn("magic link error (not shown to user)", otpError.message);
    }
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (loginError) {
      setError(t("auth.errors.invalidCredentials"));
    }
    // MFA enforcement happens centrally via AuthContext.
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: AUTH_CALLBACK_URL,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
          skipBrowserRedirect: true,
        },
      });
      if (oauthError || !data.url) throw oauthError ?? new Error("no oauth url");
      await openUrl(data.url);
    } catch (e) {
      setError(t("auth.errors.generic"));
      console.error("oauth start failed", e);
    } finally {
      setLoading(false);
    }
  }

  function onPrimarySubmit(e: React.FormEvent) {
    if (passwordExpanded) return handlePasswordSignIn(e);
    return handleMagicLink(e);
  }

  function togglePasswordExpanded() {
    setPasswordExpanded((v) => !v);
    setError(null);
    if (passwordExpanded) {
      // Collapsing back — clear password to avoid surprising autofill on re-expand.
      setPassword("");
    }
  }

  // Captcha is only required for the magic-link path.
  const captchaRequired = !passwordExpanded;
  const captchaSatisfied = !captchaRequired || !!captchaToken;
  const submitDisabled =
    loading || !email || (passwordExpanded ? !password : !captchaSatisfied);

  return (
    <div className="flex flex-col vt-anim-fade-up">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3 pr-12">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "oklch(from var(--vt-accent) l c h / 0.18)",
            color: "var(--vt-accent-2)",
            boxShadow: "inset 0 0 0 1px oklch(from var(--vt-accent) l c h / 0.35)",
          }}
        >
          <VtIcon.mic />
        </div>
        <div className="min-w-0">
          <div className="vt-display text-[15px] font-semibold tracking-tight">
            {t("auth.unified.welcome")}
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("auth.unified.welcomeSubtitle")}
          </div>
        </div>
      </div>

      {step === "sent" ? (
        <div className="px-5 pb-6 pt-2">
          <div
            className="rounded-xl p-5 text-center"
            style={{
              background: "var(--vt-ok-soft)",
              border: "1px solid oklch(from var(--vt-ok) l c h / 0.3)",
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{
                background: "oklch(from var(--vt-ok) l c h / 0.2)",
                color: "var(--vt-ok)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--vt-ok)" }}>
              {t("auth.modal.checkInbox")}
            </div>
            <div className="text-[12.5px] mt-1.5" style={{ color: "var(--vt-fg-2)" }}>
              {t("auth.unified.magicLinkSentBody")}{" "}
              {email && (
                <>
                  <span
                    className="vt-mono font-medium"
                    style={{ color: "var(--vt-fg)" }}
                  >
                    {email}
                  </span>
                  .
                </>
              )}
            </div>
            <button
              onClick={() => setStep("form")}
              className="vt-btn mt-4 mx-auto"
            >
              {t("auth.unified.useAnotherEmail")}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-5">
          {/* Google OAuth */}
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={loading}
            className="w-full h-10 rounded-lg flex items-center justify-center gap-2.5 text-[13px] font-medium transition disabled:opacity-50 mb-3"
            style={{
              background: "var(--vt-surface)",
              border: "1px solid var(--vt-border)",
              color: "var(--vt-fg)",
            }}
          >
            <GoogleIcon />
            {t("auth.login.oauthGoogle")}
          </button>

          <div className="flex items-center gap-3 my-3">
            <div className="h-px flex-1" style={{ background: "var(--vt-border)" }} />
            <span
              className="text-[10.5px] uppercase tracking-wider"
              style={{ color: "var(--vt-fg-4)" }}
            >
              {t("auth.modal.or")}
            </span>
            <div className="h-px flex-1" style={{ background: "var(--vt-border)" }} />
          </div>

          <form onSubmit={onPrimarySubmit} className="space-y-2.5">
            <div>
              <label
                className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block"
                style={{ color: "var(--vt-fg-4)" }}
                htmlFor="auth-email"
              >
                {t("auth.login.magicLinkLabel")}
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  <VtIcon.mail />
                </span>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.login.magicLinkPlaceholder")}
                  className="w-full h-9 pl-9 pr-3 rounded-md text-[13px] outline-none transition"
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
                  disabled={loading}
                />
              </div>
            </div>

            {passwordExpanded && (
              <div>
                <label
                  className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block"
                  style={{ color: "var(--vt-fg-4)" }}
                  htmlFor="auth-password"
                >
                  {t("auth.signup.passwordLabel")}
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    <LockIcon />
                  </span>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-9 pl-9 pr-3 rounded-md text-[13px] outline-none transition"
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
                    disabled={loading}
                  />
                </div>
                <div className="text-right mt-1.5">
                  <button
                    type="button"
                    onClick={() => onNavigate("reset-request")}
                    className="text-[11.5px] underline"
                    style={{ color: "var(--vt-accent-2)" }}
                  >
                    {t("auth.login.forgotPassword")}
                  </button>
                </div>
              </div>
            )}

            {captchaRequired && (
              <div className="my-3 flex justify-center">
                <TurnstileWidget
                  onSuccess={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                  onError={() => setCaptchaToken(null)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="vt-btn-primary w-full justify-center mt-2"
            >
              {!passwordExpanded && <VtIcon.mail />}
              {passwordExpanded
                ? t("auth.unified.signInButton")
                : t("auth.unified.continueButton")}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={togglePasswordExpanded}
                className="inline-flex items-center gap-1.5 text-[12px] underline"
                style={{ color: "var(--vt-accent-2)" }}
              >
                {passwordExpanded
                  ? t("auth.unified.passwordToggleCollapse")
                  : t("auth.unified.passwordToggleExpand")}
                <ChevronIcon open={passwordExpanded} />
              </button>
            </div>

            {error && (
              <p role="alert" className="text-[12px] text-center" style={{ color: "var(--vt-danger)" }}>
                {error}
              </p>
            )}
          </form>

          <div
            className="text-[10.5px] mt-4 leading-relaxed text-center"
            style={{ color: "var(--vt-fg-4)" }}
          >
            {t("auth.modal.legal")}
          </div>
        </div>
      )}
    </div>
  );
}
