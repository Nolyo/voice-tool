import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronUp,
  Cloud,
  LogOut,
  Plus,
  Settings2,
  Shield,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { ProfilesManageDialog } from "./ProfilesManageDialog";

interface ProfileSwitcherProps {
  collapsed: boolean;
  onOpenAccountPage?: () => void;
}

export function ProfileSwitcher({
  collapsed,
  onOpenAccountPage,
}: ProfileSwitcherProps) {
  const { t } = useTranslation();
  const { profiles, activeProfileId, createProfile, switchProfile } =
    useProfiles();
  const { status, user, openAuthModal, signOut } = useAuth();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const isSignedIn = status === "signed-in";

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (showCreate && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [showCreate]);

  // Fetch MFA enrollment when signed in
  useEffect(() => {
    if (!isSignedIn) {
      setMfaEnabled(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      setMfaEnabled((data?.totp?.length ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id]);

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function getAccountInitials(email: string | null | undefined): string {
    if (!email) return "?";
    const local = email.split("@")[0] ?? "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }

  async function handleSwitch(id: string) {
    if (id === activeProfileId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setSwitching(true);
    try {
      await switchProfile(id);
    } catch (err) {
      toast.error(t("profile.errorSwitch") + ": " + String(err));
      setSwitching(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createProfile(name);
      setNewName("");
      setShowCreate(false);
    } catch (err) {
      toast.error(t("profile.errorCreate") + ": " + String(err));
    } finally {
      setCreating(false);
    }
  }

  function openManage() {
    setOpen(false);
    setShowManage(true);
  }

  function openCreate() {
    setOpen(false);
    setShowCreate(false);
    setShowManage(false);
    setOpen(true);
    setShowCreate(true);
  }

  function handleOpenAccount() {
    setOpen(false);
    onOpenAccountPage?.();
  }

  function handleSignIn() {
    setOpen(false);
    openAuthModal();
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  if (switching) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
        <UserCircle2 className="w-4 h-4 shrink-0 animate-pulse" />
        {!collapsed && (
          <span className="truncate">{t("profile.switchingRestart")}</span>
        )}
      </div>
    );
  }

  // Status dot color
  // Désactivé temporairement : l'indicateur ambre « 2FA non activée » est jugé
  // trop insistant pour les comptes qui choisissent volontairement de ne pas
  // activer la 2FA. À remplacer plus tard par un signal moins répétitif.
  // const statusDot = !isSignedIn
  //   ? "bg-muted-foreground/40"
  //   : mfaEnabled
  //     ? "bg-emerald-500 shadow-[0_0_6px_currentColor] text-emerald-500"
  //     : "bg-amber-500 shadow-[0_0_6px_currentColor] text-amber-500";

  const subline = !isSignedIn
    ? t("profile.localNotSynced", { defaultValue: "Local · non synchronisé" })
    : (user?.email ?? "");

  return (
    <>
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setOpen((prev) => !prev)}
          title={
            collapsed
              ? activeProfile?.name ?? t("profile.label")
              : undefined
          }
          className={`w-full flex items-center gap-2 rounded-md text-sm text-foreground hover:bg-accent/50 transition-colors cursor-pointer ${
            collapsed ? "justify-center p-2" : "px-2 py-1.5"
          }`}
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
            {activeProfile ? getInitials(activeProfile.name) : "?"}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left leading-tight">
                <div className="text-[12.5px] font-medium truncate">
                  {activeProfile?.name ?? t("profile.label")}
                </div>
                <div className="text-[10.5px] text-muted-foreground truncate">
                  {subline}
                </div>
              </div>
              {/* <span
                aria-hidden
                className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`}
              /> */}
              <ChevronUp
                className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${
                  open ? "" : "rotate-180"
                }`}
              />
            </>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className={`absolute z-50 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl py-1.5 ${
              collapsed
                ? "left-full bottom-0 ml-2 min-w-[260px]"
                : "bottom-full left-0 mb-1 w-full"
            }`}
          >
            {/* Account header */}
            {isSignedIn ? (
              <div className="px-1.5 pb-1.5">
                <button
                  onClick={handleOpenAccount}
                  className="w-full flex items-center gap-2.5 p-2 rounded-md transition-colors bg-muted/30 border border-border hover:bg-muted/60 cursor-pointer text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                    {getAccountInitials(user?.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium truncate">
                      {user?.email}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10.5px] mt-0.5">
                      {mfaEnabled ? (
                        <span className="inline-flex items-center gap-1 text-vt-ok">
                          <ShieldCheck className="w-3 h-3" />
                          {t("auth.security.twoFactorEnabled")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-vt-warn">
                          <Shield className="w-3 h-3" />
                          {t("auth.security.twoFactorDisabled")}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <div className="px-1.5 pb-1.5">
                <button
                  onClick={handleSignIn}
                  className="w-full flex items-center gap-2.5 p-2 rounded-md transition-colors bg-primary/10 border border-primary/30 hover:bg-primary/15 cursor-pointer text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium">
                      {t("auth.cta.header")}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {t("auth.cta.dashboardCard")}
                    </div>
                  </div>
                </button>
              </div>
            )}

            <div className="border-t border-border my-1" />

            {/* Profile list */}
            <div className="px-2 pt-0.5 pb-1">
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pt-1 pb-1">
                {t("profile.activeProfileLabel", {
                  defaultValue: "Profil actif",
                })}
              </div>
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleSwitch(profile.id)}
                  className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-sm text-left hover:bg-accent/50 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                    {getInitials(profile.name)}
                  </div>
                  <span className="flex-1 truncate text-[12.5px]">
                    {profile.name}
                  </span>
                  {profile.id === activeProfileId && (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-border my-1" />

            <div className="px-2 pb-1">
              {showCreate ? (
                <div className="px-1.5 py-1.5 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    {t("profile.profileName")}
                  </p>
                  <Input
                    ref={createInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("profile.profileNamePlaceholder")}
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setShowCreate(false);
                    }}
                  />
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={() => setShowCreate(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                    >
                      {t("profile.createProfile")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-[12.5px] text-left hover:bg-accent/50 cursor-pointer text-muted-foreground"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("profile.newProfile")}</span>
                </button>
              )}

              <button
                onClick={openManage}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-[12.5px] text-left hover:bg-accent/50 cursor-pointer text-muted-foreground"
              >
                <Settings2 className="w-3.5 h-3.5 shrink-0" />
                <span>{t("profile.manageProfiles")}</span>
              </button>

              {isSignedIn && (
                <>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => void handleSignOut()}
                    className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-[12.5px] text-left hover:bg-accent/50 cursor-pointer text-muted-foreground"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("auth.logout.label")}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Manage dialog (full-screen modal) */}
      {showManage && (
        <ProfilesManageDialog
          onClose={() => setShowManage(false)}
          onCreateNew={openCreate}
        />
      )}
    </>
  );
}
