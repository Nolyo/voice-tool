import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const { t } = useTranslation();

  async function copyAll() {
    await writeText(codes.join("\n"));
  }

  function downloadTxt() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voice-tool-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">{t("auth.twoFactor.activation.recoveryWarning")}</p>
      <pre className="p-3 rounded-lg bg-muted text-sm font-mono whitespace-pre-wrap">
        {codes.join("\n")}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="flex-1 px-3 py-2 rounded-md border border-input text-sm hover:bg-muted"
        >
          {t("auth.twoFactor.activation.copyAll")}
        </button>
        <button
          type="button"
          onClick={downloadTxt}
          className="flex-1 px-3 py-2 rounded-md border border-input text-sm hover:bg-muted"
        >
          {t("auth.twoFactor.activation.download")}
        </button>
      </div>
    </div>
  );
}
