import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronUp, Plus, Settings2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProfiles } from "@/contexts/ProfilesContext";
import { ProfilesManageDialog } from "./ProfilesManageDialog";

interface ProfileSwitcherProps {
  collapsed: boolean;
}

export function ProfileSwitcher({ collapsed }: ProfileSwitcherProps) {
  const { t } = useTranslation();
  const { profiles, activeProfileId, createProfile, switchProfile } =
    useProfiles();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

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

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
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
      // Page reloads automatically — switching state resets on unmount
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
    // open create inline in dropdown
    setOpen(true);
    setShowCreate(true);
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
            collapsed ? "justify-center p-2" : "px-2 py-2"
          }`}
        >
          {/* Avatar */}
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
            {activeProfile ? getInitials(activeProfile.name) : "?"}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate font-medium">
                {activeProfile?.name ?? t("profile.label")}
              </span>
              <ChevronUp
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                  open ? "" : "rotate-180"
                }`}
              />
            </>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className={`absolute z-50 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl py-1 min-w-[180px] ${
              collapsed ? "left-full bottom-0 ml-2" : "bottom-full left-0 mb-1 w-full"
            }`}
          >
            {/* Profile list */}
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleSwitch(profile.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/50 cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                  {getInitials(profile.name)}
                </div>
                <span className="flex-1 truncate">{profile.name}</span>
                {profile.id === activeProfileId && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}

            <div className="border-t border-border my-1" />

            {/* Create inline */}
            {showCreate ? (
              <div className="px-3 py-2 space-y-2">
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
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/50 cursor-pointer text-muted-foreground"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{t("profile.newProfile")}</span>
              </button>
            )}

            <button
              onClick={openManage}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/50 cursor-pointer text-muted-foreground"
            >
              <Settings2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t("profile.manageProfiles")}</span>
            </button>
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
