// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

interface PendingDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  os_name: string | null;
  os_version: string | null;
  app_version: string | null;
  label: string | null;
  first_seen_at: string;
}

type SendResult = { ok: true } | { ok: false; message: string };

interface SendEmailParams {
  to: string;
  deviceName: string;
  osName: string;
  appVersion: string;
  timestamp: string;
}

export interface Deps {
  cronSecret: string;
  selectPending: () => Promise<PendingDevice[]>;
  getUserEmail: (uid: string) => Promise<string | null>;
  sendEmail: (params: SendEmailParams) => Promise<SendResult>;
  markNotified: (deviceId: string) => Promise<void>;
}

const FROM_DEFAULT = "Lexena <noreply@send.lexena.app>";
const SECURITY_CONTACT = "security@lexena.app";

function buildPlainText(p: SendEmailParams): string {
  return [
    "Bonjour,",
    "",
    "Une nouvelle connexion à votre compte Lexena a été détectée.",
    "",
    `Appareil : ${p.deviceName}`,
    `Système : ${p.osName}`,
    `Version Lexena : ${p.appVersion}`,
    `Heure : ${p.timestamp}`,
    "",
    "Si c'est bien vous : aucune action n'est nécessaire.",
    "",
    "Si ce n'est pas vous :",
    "- Changez immédiatement votre mot de passe (Settings > Sécurité)",
    "- Activez la 2FA si ce n'est pas déjà fait",
    "- Révoquez la session de l'appareil suspect (Settings > Sécurité > Appareils)",
    `- Contactez-nous : ${SECURITY_CONTACT}`,
    "",
    "—",
    "L'équipe Lexena",
  ].join("\n");
}

function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
  const fromAddr = Deno.env.get("EMAIL_FROM") ?? FROM_DEFAULT;
  const client: SupabaseClient = createClient(url, key);

  return {
    cronSecret,
    async selectPending() {
      const { data, error } = await client
        .from("user_devices")
        .select(
          "id, user_id, device_fingerprint, os_name, os_version, app_version, label, first_seen_at",
        )
        .is("notified_at", null)
        .order("first_seen_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PendingDevice[];
    },
    async getUserEmail(uid: string) {
      const { data, error } = await client.auth.admin.getUserById(uid);
      if (error) return null;
      return data?.user?.email ?? null;
    },
    async sendEmail(params) {
      const subject = "Nouvelle connexion à votre compte Lexena";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [params.to],
          subject,
          text: buildPlainText(params),
          headers: { "X-Lexena-Email-Type": "new-device" },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, message: `resend ${res.status}: ${body.slice(0, 300)}` };
      }
      return { ok: true };
    },
    async markNotified(deviceId: string) {
      const { error } = await client
        .from("user_devices")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", deviceId);
      if (error) throw error;
    },
  };
}

export async function handler(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${deps.cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const start = performance.now();
  let devices: PendingDevice[];
  try {
    devices = await deps.selectPending();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "new_device_email_error", phase: "selectPending", message }));
    return new Response(JSON.stringify({ error: "selectPending failed", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  const errors: Array<{ device_id: string; phase: string; message: string }> = [];

  for (const d of devices) {
    try {
      const email = await deps.getUserEmail(d.user_id);
      if (!email) {
        errors.push({ device_id: d.id, phase: "getUserEmail", message: "user not found or no email" });
        continue;
      }
      const deviceName = (d.label?.trim()) || `Device ${d.device_fingerprint.slice(0, 8)}`;
      const osName = [d.os_name, d.os_version].filter((s): s is string => !!s).join(" ") || "—";
      const appVersion = d.app_version || "—";
      const timestamp = d.first_seen_at;
      const result = await deps.sendEmail({ to: email, deviceName, osName, appVersion, timestamp });
      if (!result.ok) {
        errors.push({ device_id: d.id, phase: "sendEmail", message: result.message });
        continue; // do not mark — retry next tick
      }
      try {
        await deps.markNotified(d.id);
      } catch (mErr) {
        const message = mErr instanceof Error ? mErr.message : String(mErr);
        errors.push({
          device_id: d.id,
          phase: "markNotified",
          message: `email sent but mark failed: ${message}`,
        });
        continue;
      }
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ device_id: d.id, phase: "loop", message });
    }
  }

  const duration_ms = Math.round(performance.now() - start);
  console.log(JSON.stringify({
    event: "new_device_email_run",
    sent,
    errors: errors.length,
    duration_ms,
  }));
  return new Response(JSON.stringify({ sent, errors, duration_ms }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

if (import.meta.main) {
  Deno.serve((req) => handler(req, realDeps()));
}
