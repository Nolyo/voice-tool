import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfiles, type ProfileMeta } from "@/contexts/ProfilesContext";

interface ProfilesManageDialogProps {
  onClose: () => void;
  onCreateNew: () => void;
}

export function ProfilesManageDialog({
  onClose,
  onCreateNew,
}: ProfilesManageDialogProps) {
  const { t } = useTranslation();
  const { profiles, activeProfileId, renameProfile, deleteProfile } =
    useProfiles();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  function startEdit(profile: ProfileMeta) {
    setDeletingId(null);
    setEditingId(profile.id);
    setEditName(profile.name);
  }

  async function confirmRename() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    try {
      await renameProfile(editingId, name);
    } catch (err) {
      toast.error(t("profile.errorRename") + ": " + String(err));
    } finally {
      setEditingId(null);
    }
  }

  function startDelete(id: string) {
    setEditingId(null);
    setDeletingId(id);
  }

  async function confirmDelete() {
    if (!deletingId) return;
    try {
      await deleteProfile(deletingId);
    } catch (err) {
      toast.error(t("profile.errorDelete") + ": " + String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background text-foreground border border-border rounded-lg shadow-xl w-[420px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">{t("profile.manageProfiles")}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile list */}
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              {/* View / edit */}
              {editingId === profile.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 text-sm flex-1"
                  />
                  <button
                    onClick={confirmRename}
                    className="text-green-500 hover:text-green-400 cursor-pointer"
                    title={t("common.save")}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    title={t("common.cancel")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : deletingId === profile.id ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("profile.deleteConfirmDesc")}
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingId(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={confirmDelete}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">{profile.name}</span>
                    {profile.id === activeProfileId && (
                      <span className="text-xs text-primary shrink-0">
                        ({t("profile.active")})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(profile)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded"
                      title={t("profile.rename")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {profile.id !== activeProfileId && profiles.length > 1 && (
                      <button
                        onClick={() => startDelete(profile.id)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1 rounded"
                        title={t("common.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCreateNew}>
            {t("profile.newProfile").replace("...", "")}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
