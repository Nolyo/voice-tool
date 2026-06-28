import { useMemo } from "react";
import { useTranslation } from "react-i18next";

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isToday(d: Date): boolean {
  return startOfDay(new Date()).getTime() === startOfDay(d).getTime();
}

export function useDateFormatters() {
  const { t, i18n } = useTranslation();

  return useMemo(() => {
    const locale = i18n.language === "en" ? "en-US" : "fr-FR";
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "long" });
    const monthDayFmt = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    });
    const shortDateFmt = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
    });
    const timeFmt = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const longDateFmt = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const relativeFmt = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    });

    function dayLabel(d: Date): string {
      const today = startOfDay(new Date());
      const dd = startOfDay(d);
      const diff = Math.round((today.getTime() - dd.getTime()) / 86400000);
      if (diff === 0) return t("common.today");
      if (diff === 1) return t("common.yesterday");
      if (diff < 7 && diff > 0) return weekdayFmt.format(dd);
      return monthDayFmt.format(dd);
    }

    // Locale-aware "x minutes ago" / "il y a x minutes". Picks the largest
    // sensible unit. Computes against the call-time clock, so callers re-render
    // to refresh it.
    function formatRelative(d: Date): string {
      const sec = Math.round((d.getTime() - Date.now()) / 1000);
      const abs = Math.abs(sec);
      if (abs < 60) return relativeFmt.format(sec, "second");
      const min = Math.round(sec / 60);
      if (Math.abs(min) < 60) return relativeFmt.format(min, "minute");
      const hr = Math.round(min / 60);
      if (Math.abs(hr) < 24) return relativeFmt.format(hr, "hour");
      const day = Math.round(hr / 24);
      return relativeFmt.format(day, "day");
    }

    return {
      locale,
      dayLabel,
      formatShortDate: (d: Date) => shortDateFmt.format(d),
      formatMonthDay: (d: Date) => monthDayFmt.format(d),
      formatTime: (d: Date) => timeFmt.format(d),
      formatLongDate: (d: Date) => longDateFmt.format(d),
      formatRelative,
    };
  }, [i18n.language, t]);
}
