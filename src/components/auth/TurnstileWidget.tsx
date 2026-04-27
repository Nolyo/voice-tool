import { Turnstile } from "@marsidev/react-turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/supabase";

interface Props {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Cloudflare Turnstile widget wrapper.
 * The token is passed to supabase.auth.signUp({ options: { captchaToken } });
 * Supabase validates it natively (see [auth.captcha] in supabase/config.toml).
 */
export function TurnstileWidget({ onSuccess, onExpire, onError }: Props) {
  if (!TURNSTILE_SITE_KEY) {
    console.warn("VITE_TURNSTILE_SITE_KEY not set — captcha disabled in dev");
    return null;
  }
  return (
    <Turnstile
      siteKey={TURNSTILE_SITE_KEY}
      onSuccess={onSuccess}
      onExpire={onExpire}
      onError={onError}
      options={{ theme: "auto", size: "flexible" }}
    />
  );
}
