import { supabase } from "@/lib/supabase";
import { invoke } from "@tauri-apps/api/core";

export async function downloadAccountExport(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("account-export", {
    body: {},
  });
  if (error) throw error;
  if (!data) throw new Error("empty response from account-export");
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `voice-tool-export_${stamp}.json`;
  return invoke<string>("save_export_to_download", {
    payloadJson: JSON.stringify(data, null, 2),
    suggestedFilename: filename,
  });
}
