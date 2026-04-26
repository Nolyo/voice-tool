import type { LocalSnippet, CloudSnippetRow, CloudUserSettingsRow } from "./types";
import type { AppSettings } from "@/lib/settings";
import { applyCloudSettings } from "./mapping";

export function mergeSnippetLWW(
  local: LocalSnippet | null,
  remote: CloudSnippetRow
): LocalSnippet {
  const remoteAsLocal: LocalSnippet = {
    id: remote.id,
    label: remote.label,
    content: remote.content,
    shortcut: remote.shortcut,
    created_at: remote.created_at,
    updated_at: remote.updated_at,
    deleted_at: remote.deleted_at,
  };
  if (!local) return remoteAsLocal;

  const localTs = new Date(local.updated_at).getTime();
  const remoteTs = new Date(remote.updated_at).getTime();
  return remoteTs >= localTs ? remoteAsLocal : local;
}

export type SettingsMergeAction = "apply-cloud" | "push-local" | "no-op";

export interface SettingsMergeResult {
  settings: AppSettings["settings"];
  action: SettingsMergeAction;
}

/** Décide qui gagne entre settings locaux et cloud.
 *  - `localLastPushedAt` = dernier `updated_at` renvoyé par le serveur au précédent push.
 *    Si null, on est en pre-sync → cloud gagne si présent.
 *  - Si `cloud === null`, on pousse le local.
 */
export function mergeSettingsLWW(
  local: AppSettings["settings"],
  localLastPushedAt: string | null,
  cloud: CloudUserSettingsRow | null
): SettingsMergeResult {
  if (!cloud) {
    return { settings: local, action: "push-local" };
  }
  if (!localLastPushedAt) {
    return {
      settings: applyCloudSettings(local, cloud.data),
      action: "apply-cloud",
    };
  }
  const localTs = new Date(localLastPushedAt).getTime();
  const cloudTs = new Date(cloud.updated_at).getTime();
  if (cloudTs > localTs) {
    return {
      settings: applyCloudSettings(local, cloud.data),
      action: "apply-cloud",
    };
  }
  return { settings: local, action: "push-local" };
}
