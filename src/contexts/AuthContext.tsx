import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "@/lib/supabase";

export type AuthStatus = "loading" | "signed-out" | "signed-in" | "mfa-required";

export interface DeepLinkPayload {
  url: string;
  params: Record<string, string>;
  valid: boolean;
  reason: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  keyringAvailable: boolean;
  /** Opened when the user clicks the "Sign in" CTA. */
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  /** Signals an MFA challenge is pending (set by login flows). */
  mfaChallenge: { factorId: string } | null;
  setMfaChallenge: (c: { factorId: string } | null) => void;
  /** Re-evaluates AAL and prompts MFA if needed. Called after recovery flows complete. */
  reevaluateMfa: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [keyringAvailable, setKeyringAvailable] = useState(true);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{ factorId: string } | null>(null);
  const restoredRef = useRef(false);
  // True while a recovery deep-link is being processed: defer MFA enforcement
  // so the user can set a new password before being challenged.
  const deferMfaRef = useRef(false);

  /**
   * Returns "mfa-required" if the current session has a verified TOTP factor
   * but isn't elevated to aal2 yet. Side-effect: sets mfaChallenge accordingly.
   */
  async function evaluateMfa(): Promise<"signed-in" | "mfa-required"> {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") {
      setMfaChallenge(null);
      return "signed-in";
    }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) {
      setMfaChallenge(null);
      return "signed-in";
    }
    setMfaChallenge({ factorId: totp.id });
    return "mfa-required";
  }

  async function reevaluateMfa() {
    const next = await evaluateMfa();
    setStatus(next);
    if (next === "mfa-required") setAuthModalOpen(true);
    else setAuthModalOpen(false);
  }

  // --- Session restore on boot ---
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      try {
        const stored = await invoke<string | null>("get_refresh_token");
        if (!stored) {
          setStatus("signed-out");
          return;
        }
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored });
        if (error || !data.session) {
          // Token invalid or revoked — purge and sign out.
          await invoke("clear_refresh_token");
          setStatus("signed-out");
          return;
        }
        setSession(data.session);
        setUser(data.session.user);
        const next = await evaluateMfa();
        setStatus(next);
        if (next === "mfa-required") setAuthModalOpen(true);
        // Rotate: Supabase returned a fresh refresh token, persist it.
        if (data.session.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
        upsertDevice(data.session.user.id);
      } catch (e) {
        console.error("session restore failed", e);
        setStatus("signed-out");
      }
    })();
  }, []);

  // --- Persist each rotation + react to auth events ---
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (event === "TOKEN_REFRESHED" && next?.refresh_token) {
        const res = await invoke<{ available: boolean }>("store_refresh_token", {
          token: next.refresh_token,
        });
        setKeyringAvailable(res.available);
      }
      if (event === "SIGNED_OUT") {
        setMfaChallenge(null);
        setStatus("signed-out");
      }
      if (event === "SIGNED_IN" && next) {
        upsertDevice(next.user.id).catch(() => {});
        if (deferMfaRef.current) {
          // Recovery in progress — let ResetPasswordConfirmView complete first;
          // it will call reevaluateMfa() on success.
          deferMfaRef.current = false;
          setStatus("signed-in");
          return;
        }
        const status = await evaluateMfa();
        setStatus(status);
        if (status === "signed-in") setAuthModalOpen(false);
        else setAuthModalOpen(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Deep link listener (emitted from Rust) ---
  useEffect(() => {
    const p = listen<DeepLinkPayload>("auth-deep-link-received", async (ev) => {
      const payload = ev.payload;
      if (!payload.valid) {
        console.warn("invalid deep link", payload.reason);
        return;
      }
      await handleAuthDeepLink(payload);
    });
    return () => {
      p.then((unlisten) => unlisten());
    };
  }, []);

  async function upsertDevice(userId: string) {
    try {
      const fp = await invoke<string>("get_or_create_device_id");
      const osName = typeof navigator !== "undefined" ? navigator.platform || "Unknown" : "Unknown";
      // TODO(v3.1): include app_version via a Tauri command when exposed.
      const { error } = await supabase.from("user_devices").upsert(
        {
          user_id: userId,
          device_fingerprint: fp,
          os_name: osName,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_fingerprint" },
      );
      if (error) console.warn("upsert user_devices failed", error.message);
    } catch (e) {
      console.warn("device upsert skipped", e);
    }
  }

  async function handleAuthDeepLink(payload: DeepLinkPayload) {
    const { type, access_token, refresh_token, code } = payload.params;
    // For recovery, defer MFA enforcement: the user must reach the
    // password-confirm view before being challenged. ResetPasswordConfirmView
    // calls reevaluateMfa() once the new password is saved.
    if (type === "recovery") deferMfaRef.current = true;
    try {
      if (code) {
        // PKCE flow (flowType: "pkce" in supabase client). Covers magic link,
        // signup, recovery, and OAuth — all come back with `?code=...`.
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (data.session?.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
        if (type === "recovery") {
          setAuthModalOpen(true);
          window.dispatchEvent(new CustomEvent("auth:recovery-mode"));
        }
      } else if (access_token && refresh_token) {
        // Legacy implicit flow (hash fragment). Kept for safety/compat.
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;
        if (data.session?.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
        if (type === "recovery") {
          setAuthModalOpen(true);
          window.dispatchEvent(new CustomEvent("auth:recovery-mode"));
        }
      }
    } catch (e) {
      console.error("deep link exchange failed", e);
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("supabase signOut failed, clearing local anyway", e);
    }
    await invoke("clear_refresh_token");
    setStatus("signed-out");
    setSession(null);
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      session,
      keyringAvailable,
      isAuthModalOpen,
      openAuthModal: () => setAuthModalOpen(true),
      closeAuthModal: () => setAuthModalOpen(false),
      mfaChallenge,
      setMfaChallenge,
      reevaluateMfa,
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, session, keyringAvailable, isAuthModalOpen, mfaChallenge],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
