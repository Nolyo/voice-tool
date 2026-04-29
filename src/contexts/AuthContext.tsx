import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "@/lib/supabase";

function flog(message: string, level: "info" | "warn" | "error" = "info") {
  invoke("frontend_log", { level, message }).catch(() => {});
}

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
  /** Initial tab to show in the auth modal ("signin" | "signup"). */
  initialAuthMode: "signin" | "signup";
  openAuthModal: (mode?: "signin" | "signup") => void;
  closeAuthModal: () => void;
  /** Signals an MFA challenge is pending (set by login flows). */
  mfaChallenge: { factorId: string } | null;
  setMfaChallenge: (c: { factorId: string } | null) => void;
  /** Re-evaluates AAL and prompts MFA if needed. Called after recovery flows complete. */
  reevaluateMfa: () => Promise<void>;
  /** Last deep-link auth error (e.g. PKCE verifier missing, code expired). */
  deepLinkError: string | null;
  clearDeepLinkError: () => void;
  signOut: () => Promise<void>;
  /** Populated when a deletion request exists for the current user. */
  deletionPending: { requestedAt: string; purgeAt: string } | null;
  /** Refreshes the deletionPending state from the DB (used after cancel). */
  refreshDeletionPending: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [keyringAvailable, setKeyringAvailable] = useState(true);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [initialAuthMode, setInitialAuthMode] = useState<"signin" | "signup">("signin");
  const [mfaChallenge, setMfaChallenge] = useState<{ factorId: string } | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [deletionPending, setDeletionPending] = useState<
    { requestedAt: string; purgeAt: string } | null
  >(null);
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

  async function fetchDeletionPending(userId: string) {
    const { data, error } = await supabase
      .from("account_deletion_requests")
      .select("requested_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      flog(`deletion-pending check failed: ${error.message}`, "warn");
      return null;
    }
    if (!data) return null;
    const requestedAt = data.requested_at as string;
    const purgeAt = new Date(
      new Date(requestedAt).getTime() + 30 * 24 * 3600 * 1000,
    ).toISOString();
    return { requestedAt, purgeAt };
  }

  async function refreshDeletionPending() {
    if (!session?.user) {
      setDeletionPending(null);
      return;
    }
    const pending = await fetchDeletionPending(session.user.id);
    setDeletionPending(pending);
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
      flog(`onAuthStateChange event=${event} hasSession=${!!next}`);
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
          flog("SIGNED_IN: deferred-mfa branch, status=signed-in");
          return;
        }
        // Defer all supabase.auth.* calls: SIGNED_IN may be fired from inside
        // exchangeCodeForSession, which holds GoTrueClient's internal lock.
        // Calling getSession()/mfa.* here would re-enter the lock and deadlock
        // (the queued operation waits for the outer exchange which waits for
        // this subscriber). setTimeout(0) lets the lock release first.
        setTimeout(() => {
          void (async () => {
            const status = await evaluateMfa();
            setStatus(status);
            flog(`SIGNED_IN: evaluateMfa=${status} (deferred)`);
            if (status === "signed-in") setAuthModalOpen(false);
            else setAuthModalOpen(true);
          })();
        }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Deep link listener (emitted from Rust) ---
  // Two delivery paths covered:
  //   1. Live: `auth-deep-link-received` event from Rust.
  //   2. Buffered: `consume_pending_deep_link` Tauri command — drains a payload
  //      that fired before this listener mounted (cold-start race).
  useEffect(() => {
    async function processPayload(payload: DeepLinkPayload, source: "live" | "buffered") {
      flog(
        `processPayload source=${source} valid=${payload.valid} type=${payload.params.type ?? "<none>"} hasCode=${!!payload.params.code} hasAccessToken=${!!payload.params.access_token}`,
      );
      if (!payload.valid) {
        console.warn("invalid deep link", payload.reason);
        setDeepLinkError(payload.reason ?? "invalid deep link");
        return;
      }
      await handleAuthDeepLink(payload);
    }

    const p = listen<DeepLinkPayload>("auth-deep-link-received", (ev) => {
      flog("listener received auth-deep-link-received event");
      void processPayload(ev.payload, "live");
    });

    // Drain anything captured before mount.
    invoke<DeepLinkPayload | null>("consume_pending_deep_link")
      .then((pending) => {
        if (pending) {
          flog("consume_pending_deep_link returned a payload, draining");
          void processPayload(pending, "buffered");
        } else {
          flog("consume_pending_deep_link returned null (no buffered payload)");
        }
      })
      .catch((e) => {
        flog(`consume_pending_deep_link failed: ${String(e)}`, "warn");
      });

    return () => {
      p.then((unlisten) => unlisten());
    };
  }, []);

  // --- Deletion-pending check: runs whenever signed-in status is reached ---
  useEffect(() => {
    if (status !== "signed-in" || !session?.user) {
      setDeletionPending(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const pending = await fetchDeletionPending(session.user.id);
      if (!cancelled) setDeletionPending(pending);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id]);

  async function upsertDevice(userId: string) {
    try {
      const fp = await invoke<string>("get_or_create_device_id");
      let osName = typeof navigator !== "undefined" ? navigator.platform || "Unknown" : "Unknown";
      let osVersion: string | null = null;
      let appVersion: string | null = null;
      try {
        const info = await invoke<{ app_version: string; os_name: string; os_version: string }>(
          "get_device_info",
        );
        appVersion = info.app_version;
        osVersion = info.os_version;
        if (info.os_name) osName = info.os_name;
      } catch (e) {
        flog(`get_device_info failed, falling back to navigator.platform: ${e}`, "warn");
      }
      const { error } = await supabase.from("user_devices").upsert(
        {
          user_id: userId,
          device_fingerprint: fp,
          os_name: osName,
          os_version: osVersion,
          app_version: appVersion,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_fingerprint" },
      );
      if (error) flog(`upsert user_devices failed: ${error.message}`, "warn");
    } catch (e) {
      flog(`device upsert skipped: ${e}`, "warn");
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
        flog("handleAuthDeepLink: calling exchangeCodeForSession");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          flog(`exchangeCodeForSession error: ${error.message}`, "error");
          throw error;
        }
        flog(
          `exchangeCodeForSession ok hasSession=${!!data.session} hasRefreshToken=${!!data.session?.refresh_token}`,
        );
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
      } else {
        throw new Error("deep link has neither code nor token pair");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("deep link exchange failed", e);
      setDeepLinkError(message);
      setAuthModalOpen(true);
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
      initialAuthMode,
      openAuthModal: (mode = "signin") => {
        setInitialAuthMode(mode);
        setAuthModalOpen(true);
      },
      closeAuthModal: () => setAuthModalOpen(false),
      mfaChallenge,
      setMfaChallenge,
      reevaluateMfa,
      deepLinkError,
      clearDeepLinkError: () => setDeepLinkError(null),
      signOut,
      deletionPending,
      refreshDeletionPending,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, session, keyringAvailable, isAuthModalOpen, initialAuthMode, mfaChallenge, deepLinkError, deletionPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
