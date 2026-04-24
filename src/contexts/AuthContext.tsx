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
        setStatus("signed-in");
        // Rotate: Supabase returned a fresh refresh token, persist it.
        if (data.session.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
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
        setStatus("signed-out");
      }
      if (event === "SIGNED_IN" && next) {
        setStatus("signed-in");
        setAuthModalOpen(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- MFA challenge listener (dispatched from LoginView) ---
  useEffect(() => {
    const onMfa = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { factorId: string };
      setMfaChallenge(detail);
    };
    window.addEventListener("auth:mfa-required", onMfa);
    return () => window.removeEventListener("auth:mfa-required", onMfa);
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

  async function handleAuthDeepLink(payload: DeepLinkPayload) {
    const { type, access_token, refresh_token, code } = payload.params;
    try {
      if ((type === "magiclink" || type === "signup") && access_token && refresh_token) {
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
      } else if (type === "oauth" && code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (data.session?.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
      } else if (type === "recovery" && access_token && refresh_token) {
        // Set session so the reset-password view can call auth.updateUser.
        await supabase.auth.setSession({ access_token, refresh_token });
        // Open the modal onto the "reset-password-confirm" view via window event.
        setAuthModalOpen(true);
        window.dispatchEvent(new CustomEvent("auth:recovery-mode"));
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
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, session, keyringAvailable, isAuthModalOpen, mfaChallenge],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
