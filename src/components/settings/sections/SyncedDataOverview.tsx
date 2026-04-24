import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadSnippets } from "@/lib/sync/snippets-store";
import { loadDictionary } from "@/lib/sync/dictionary-store";

export function SyncedDataOverview() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{ snippets: number; words: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sn = (await loadSnippets()).filter((s) => s.deleted_at === null);
      const d = await loadDictionary();
      if (cancelled) return;
      setCounts({ snippets: sn.length, words: d.words.length });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-md border border-border p-4 text-sm space-y-2">
      <h4 className="text-sm font-medium">{t("sync.overview.title")}</h4>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>{t("sync.overview.scalars")}</li>
        <li>
          {t("sync.overview.snippets", { count: counts?.snippets ?? 0 })}
        </li>
        <li>
          {t("sync.overview.dictionary", { count: counts?.words ?? 0 })}
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        {t("sync.overview.not_synced_disclaimer")}
      </p>
    </div>
  );
}
