// POC NOL-32 — Frontend trigger for the LemonSqueezy checkout.
//
// Where it plugs in (v3):
//   Render this in the settings / onboarding page. Requires a Supabase-authenticated user.
//
// The Tauri command takes the Supabase auth user id and optional email and opens
// the checkout URL in the system browser (system UX, not embedded WebView).

import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

type CheckoutOpenResult = { opened_url: string };

type Props = {
  userId: string;
  email?: string;
  planLabel?: string;
};

export function SubscribeButton({ userId, email, planLabel = "Voice Tool Pro" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      await invoke<CheckoutOpenResult>("open_checkout", { userId, email });
    } catch (e) {
      setError(typeof e === "string" ? e : JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={loading || !userId}>
        {loading ? "Ouverture du checkout…" : `S'abonner à ${planLabel}`}
      </button>
      {error ? <p role="alert">Erreur : {error}</p> : null}
    </div>
  );
}
