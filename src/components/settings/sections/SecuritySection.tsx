import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { TwoFactorActivationFlow } from "@/components/auth/TwoFactorActivationFlow";
import { DevicesList } from "./DevicesList";

export function SecuritySection() {
  const { t } = useTranslation();
  const { keyringAvailable } = useAuth();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [showActivation, setShowActivation] = useState(false);

  async function loadMfa() {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled((data?.totp?.length ?? 0) > 0);
  }

  useEffect(() => {
    loadMfa();
  }, []);

  async function disable() {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.[0];
    if (!totp) return;
    await supabase.auth.mfa.unenroll({ factorId: totp.id });
    await loadMfa();
  }

  return (
    <section id="section-securite" className="space-y-4">
      <header>
        <h3 className="text-base font-semibold">{t("auth.security.sectionTitle")}</h3>
      </header>

      {!keyringAvailable && (
        <p role="alert" className="text-sm text-amber-600">
          {t("auth.security.keyringUnavailable")}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm">
          {mfaEnabled ? t("auth.security.twoFactorEnabled") : t("auth.security.twoFactorDisabled")}
        </p>
        {!mfaEnabled && !showActivation && (
          <button
            onClick={() => setShowActivation(true)}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            {t("auth.security.enable2fa")}
          </button>
        )}
        {mfaEnabled && (
          <button
            onClick={disable}
            className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90"
          >
            {t("auth.security.disable2fa")}
          </button>
        )}
        {showActivation && (
          <TwoFactorActivationFlow
            onDone={() => {
              setShowActivation(false);
              loadMfa();
            }}
            onCancel={() => setShowActivation(false)}
          />
        )}
      </div>

      <DevicesList />
    </section>
  );
}
