import { Turnstile } from "@marsidev/react-turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/supabase";
import { useSettings } from "@/hooks/useSettings";

interface Props {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Cloudflare Turnstile widget wrapper.
 * The token is passed to supabase.auth.signUp({ options: { captchaToken } });
 * Supabase validates it natively (see [auth.captcha] in supabase/config.toml).
 *
 * Theme follows the project's SettingsContext.theme (light / dark).
 */
export function TurnstileWidget({ onSuccess, onExpire, onError }: Props) {
  const { settings } = useSettings();
  if (!TURNSTILE_SITE_KEY) {
    console.warn("VITE_TURNSTILE_SITE_KEY not set — captcha disabled in dev");
    return null;
  }
  const turnstileTheme = settings.theme === "dark" ? "dark" : "light";
  return (
    <Turnstile
      siteKey={TURNSTILE_SITE_KEY}
      onSuccess={onSuccess}
      onExpire={onExpire}
      onError={onError}
      options={{ theme: turnstileTheme, size: "flexible" }}
    />
  );
}
