import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import { isPwnedPassword } from "@/lib/pwned-passwords";
import { isDisposableDomain, CANONICAL_COLLISION_ERROR_MARKER } from "@/lib/email-normalize";
import { VtIcon } from "@/components/settings/vt";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { TurnstileWidget } from "./TurnstileWidget";
import type { AuthView } from "./AuthModal";

type Mode = "signin" | "signup";

interface Props {
  onNavigate: (v: AuthView) => void;
  initialMode?: Mode;
}
type Method = "magic" | "password";
type Step = "form" | "sent";

function scorePassword(p: string): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  if (p.length < 10) return 1;
  if (p.length < 14) return 2;
  return 3;
}

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

export function SignInPanel({ onNavigate, initialMode = "signin" }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(initialMode);
  // Signup always uses password — magic-link only makes sense for sign-in.
  const [method, setMethod] = useState<Method>(initialMode === "signup" ? "password" : "magic");
  const [step, setStep] = useState<Step>("form");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const score = useMemo(() => scorePassword(password), [password]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captchaToken) {
      setError(t("auth.signup.captchaRequired"));
      return;
    }
    setLoading(true);
    const { error: signinError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_CALLBACK_URL, captchaToken },
    });
    setLoading(false);
    setCaptchaToken(null);
    // Generic anti-enumeration response
    setStep("sent");
    if (signinError) {
      console.warn("magic link error (not shown to user)", signinError.message);
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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError(t("auth.signup.passwordTooShort"));
      return;
    }
    if (isDisposableDomain(email)) {
      setError(t("auth.signup.emailDisposable"));
      return;
    }
    setLoading(true);
    const pwned = await isPwnedPassword(password);
    if (pwned) {
      setLoading(false);
      setError(t("auth.signup.passwordPwned"));
      return;
    }
    if (!captchaToken) {
      setLoading(false);
      setError(t("auth.signup.captchaRequired"));
      return;
    }
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: AUTH_CALLBACK_URL, captchaToken },
    });
    setLoading(false);
    if (signupError) {
      // Trigger from migration 20260601000100 raises P0001 with our message.
      if (signupError.message.includes(CANONICAL_COLLISION_ERROR_MARKER)) {
        setCaptchaToken(null);
        setError(t("auth.signup.emailAlreadyRegistered"));
        return;
      }
      console.warn("signup error (not shown)", signupError.message);
    }
    setCaptchaToken(null);
    setStep("sent");
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
    if (mode === "signup") return handleSignup(e);
    if (method === "magic") return handleMagicLink(e);
    return handlePasswordSignIn(e);
  }

  const primaryLabel =
    mode === "signup"
      ? t("auth.signup.submit")
      : method === "magic"
        ? t("auth.login.magicLinkSubmit")
        : t("auth.login.title");

  // Signup ALWAYS uses password (account creation needs a password); no method toggle in signup.
  const showPassword = mode === "signup" || method === "password";

  const captchaRequired = mode === "signup" || (mode === "signin" && method === "magic");
  const captchaSatisfied = !captchaRequired || !!captchaToken;

  return (
    <div className="flex flex-col">
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
          <div className="text-[14px] font-semibold tracking-tight">
            {mode === "signup"
              ? t("auth.signup.title")
              : t("auth.login.title")}
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("auth.login.subtitle")}
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
              {t("auth.modal.checkInbox", { defaultValue: "Vérifie ta boîte mail" })}
            </div>
            <div className="text-[12.5px] mt-1.5" style={{ color: "var(--vt-fg-2)" }}>
              {mode === "signup"
                ? t("auth.signup.success")
                : t("auth.login.magicLinkSuccess")}{" "}
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
              {t("auth.modal.useAnotherMethod", {
                defaultValue: "Utiliser une autre méthode",
              })}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-5">
          {/* Tabs */}
          <div
            className="inline-flex rounded-lg p-1 mb-4 w-full"
            style={{
              background: "var(--vt-surface)",
              border: "1px solid var(--vt-border)",
            }}
          >
            {(["signin", "signup"] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError(null);
                    if (m === "signup") setMethod("password");
                  }}
                  className="flex-1 h-8 rounded-md text-[12.5px] font-medium transition"
                  style={
                    active
                      ? {
                          background: "oklch(from var(--vt-accent) l c h / 0.18)",
                          color: "var(--vt-accent-2)",
                        }
                      : { color: "var(--vt-fg-3)" }
                  }
                >
                  {m === "signin"
                    ? t("auth.modal.tabSignIn", { defaultValue: "Connexion" })
                    : t("auth.modal.tabSignUp", { defaultValue: "Création" })}
                </button>
              );
            })}
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
                  className="w-full h-9 pl-9 pr-3 rounded-md text-[13px]"
                  style={{
                    background: "var(--vt-surface)",
                    border: "1px solid var(--vt-border)",
                    color: "var(--vt-fg)",
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            {showPassword && (
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
                    className="w-full h-9 pl-9 pr-3 rounded-md text-[13px]"
                    style={{
                      background: "var(--vt-surface)",
                      border: "1px solid var(--vt-border)",
                      color: "var(--vt-fg)",
                    }}
                    disabled={loading}
                    aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
                  />
                </div>
                {mode === "signup" && (
                  <>
                    <p
                      id="auth-password-hint"
                      className="text-[11px] mt-1.5"
                      style={{ color: "var(--vt-fg-3)" }}
                    >
                      {t("auth.signup.passwordHint")}
                    </p>
                    <div className="mt-2">
                      <PasswordStrengthMeter score={score} />
                    </div>
                  </>
                )}
                {mode === "signin" && (
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
                )}
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
              disabled={loading || !email || !captchaSatisfied}
              className="vt-btn-primary w-full justify-center mt-2"
            >
              {mode === "signin" && method === "magic" && <VtIcon.mail />}
              {primaryLabel}
            </button>

            <div className="flex items-center gap-3 my-3">
              <div className="h-px flex-1" style={{ background: "var(--vt-border)" }} />
              <span
                className="text-[10.5px] uppercase tracking-wider"
                style={{ color: "var(--vt-fg-4)" }}
              >
                {t("auth.modal.or", { defaultValue: "ou" })}
              </span>
              <div className="h-px flex-1" style={{ background: "var(--vt-border)" }} />
            </div>

            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={loading}
              className="w-full h-10 rounded-lg flex items-center justify-center gap-2.5 text-[13px] font-medium transition disabled:opacity-50"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
                color: "var(--vt-fg)",
              }}
            >
              <GoogleIcon />
              {t("auth.login.oauthGoogle")}
            </button>

            {mode === "signin" && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMethod(method === "magic" ? "password" : "magic");
                    setError(null);
                  }}
                  className="text-[12px] underline"
                  style={{ color: "var(--vt-accent-2)" }}
                >
                  {method === "magic"
                    ? t("auth.modal.usePasswordInstead", {
                        defaultValue: "Utiliser un mot de passe à la place",
                      })
                    : t("auth.modal.useMagicLinkInstead", {
                        defaultValue: "Recevoir un lien magique à la place",
                      })}
                </button>
              </div>
            )}

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
            {t("auth.modal.legal", {
              defaultValue:
                "En continuant, tu acceptes nos Conditions et notre Politique de confidentialité.",
            })}
          </div>
        </div>
      )}
    </div>
  );
}
