import { useMemo } from "react";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

export interface DailyBucket {
  date: Date;
  iso: string;
  count: number;
  durationSec: number;
  words: number;
}

export interface ProviderSlice {
  key: string;
  label: string;
  count: number;
  totalDurationSec: number;
  totalCost: number;
}

export interface TopWord {
  word: string;
  count: number;
}

export interface Statistics {
  totalCount: number;
  totalDurationSec: number;
  totalWords: number;
  totalCost: number;
  averageDurationSec: number;
  averageWordsPerMin: number;
  timeSavedSec: number;
  streakDays: number;
  longestStreakDays: number;
  topHour: number | null;
  postProcessRate: number;
  providers: ProviderSlice[];
  daily30: DailyBucket[];
  hourly: number[];
  weekHourMatrix: number[][];
  topWords: TopWord[];
  weekdayCounts: number[];
}

const FR_STOPWORDS = new Set([
  "le","la","les","un","une","des","de","du","et","ou","mais","donc","or","ni","car",
  "que","qui","quoi","dont","où","ce","cet","cette","ces","mon","ma","mes","ton","ta","tes",
  "son","sa","ses","notre","nos","votre","vos","leur","leurs","je","tu","il","elle","on","nous",
  "vous","ils","elles","me","te","se","y","en","pas","ne","plus","aussi","alors","si","oui","non",
  "à","au","aux","par","pour","dans","sur","avec","sans","sous","entre","vers","chez","contre",
  "est","es","sont","était","étaient","être","sera","seront","a","ai","as","avons","avez","ont","avait",
  "fait","faire","faut","peut","peux","peuvent","pouvoir","veux","veut","voulu","vouloir",
  "très","bien","tout","toute","tous","toutes","comme","quand","ainsi","encore","déjà","puis",
  "donc","cela","ça","celui","celle","ceux","celles","leur","mes","mon","ma","ses","sa","son",
  "j","l","d","s","t","n","m","c","qu","jusqu","lorsqu","puisqu","quoiqu",
]);

const EN_STOPWORDS = new Set([
  "the","a","an","and","or","but","so","of","to","in","on","at","by","for","with","from","as","is","are",
  "was","were","be","been","being","have","has","had","do","does","did","will","would","should","could",
  "can","may","might","must","i","you","he","she","it","we","they","me","him","her","us","them","my",
  "your","his","its","our","their","this","that","these","those","there","here","what","which","who","whom",
  "if","then","than","because","while","when","where","how","not","no","yes","up","down","out","into",
  "about","over","just","also","only","very","too","more","most","some","any","all","both","each","few",
  "such","own","same","other","same","again","further","once","ll","ve","s","t","d","m","re","don","didn",
]);

function parseAt(t: Transcription): Date {
  const iso = `${t.date}T${t.time}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${t.date} ${t.time}`);
}

function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function wordsOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function normalizeProvider(raw?: string, apiCost?: number): { key: string; label: string } {
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower.includes("openai")) return { key: "openai", label: "OpenAI" };
    if (lower.includes("groq")) return { key: "groq", label: "Groq" };
    if (lower.includes("google")) return { key: "google", label: "Google" };
    if (lower.includes("local")) return { key: "local", label: "Local" };
    return { key: lower, label: raw };
  }
  return apiCost && apiCost > 0
    ? { key: "openai", label: "OpenAI" }
    : { key: "local", label: "Local" };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

function isStopword(word: string): boolean {
  if (word.length < 3) return true;
  if (/^\d+$/.test(word)) return true;
  return FR_STOPWORDS.has(word) || EN_STOPWORDS.has(word);
}

export function useStatistics(transcriptions: Transcription[]): Statistics {
  return useMemo(() => {
    const today0 = startOfDay(new Date());
    const day30Start = new Date(today0);
    day30Start.setDate(day30Start.getDate() - 29);

    const daily30Map = new Map<string, DailyBucket>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(day30Start);
      d.setDate(day30Start.getDate() + i);
      const key = isoDay(d);
      daily30Map.set(key, { date: d, iso: key, count: 0, durationSec: 0, words: 0 });
    }

    const hourly = Array<number>(24).fill(0);
    const weekHourMatrix: number[][] = Array.from({ length: 7 }, () =>
      Array<number>(24).fill(0),
    );
    const weekdayCounts = Array<number>(7).fill(0);
    const providersMap = new Map<string, ProviderSlice>();
    const wordCounts = new Map<string, number>();
    const activeDays = new Set<string>();

    let totalDurationSec = 0;
    let totalWords = 0;
    let totalCost = 0;
    let postProcessed = 0;

    for (const tr of transcriptions) {
      const at = parseAt(tr);
      const dur = tr.duration ?? 0;
      const words = wordsOf(tr.text);
      const cost = (tr.apiCost ?? 0) + (tr.postProcessCost ?? 0);

      totalDurationSec += dur;
      totalWords += words;
      totalCost += cost;
      if (tr.originalText) postProcessed++;
      activeDays.add(isoDay(at));

      const hour = at.getHours();
      hourly[hour]++;
      const wd = at.getDay();
      weekHourMatrix[wd][hour]++;
      weekdayCounts[wd]++;

      const key = isoDay(at);
      const bucket = daily30Map.get(key);
      if (bucket) {
        bucket.count++;
        bucket.durationSec += dur;
        bucket.words += words;
      }

      const prov = normalizeProvider(tr.transcriptionProvider, tr.apiCost);
      const slice = providersMap.get(prov.key) ?? {
        key: prov.key,
        label: prov.label,
        count: 0,
        totalDurationSec: 0,
        totalCost: 0,
      };
      slice.count++;
      slice.totalDurationSec += dur;
      slice.totalCost += cost;
      providersMap.set(prov.key, slice);

      for (const tok of tokenize(tr.text)) {
        if (isStopword(tok)) continue;
        wordCounts.set(tok, (wordCounts.get(tok) ?? 0) + 1);
      }
    }

    const totalCount = transcriptions.length;
    const averageDurationSec = totalCount ? totalDurationSec / totalCount : 0;
    const averageWordsPerMin =
      totalDurationSec > 0 ? (totalWords / totalDurationSec) * 60 : 0;
    const timeSavedSec = totalWords * (60 / 40); // assume 40 wpm typing baseline

    const topHourValue = hourly.reduce((m, _v, i, arr) => (arr[i] > arr[m] ? i : m), 0);
    const topHour = hourly[topHourValue] > 0 ? topHourValue : null;

    let streakDays = 0;
    {
      const cursor = new Date(today0);
      while (activeDays.has(isoDay(cursor))) {
        streakDays++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    let longestStreakDays = 0;
    {
      const sorted = Array.from(activeDays)
        .map((iso) => new Date(iso + "T00:00:00"))
        .sort((a, b) => a.getTime() - b.getTime());
      let run = 0;
      let prev: number | null = null;
      for (const d of sorted) {
        const t = startOfDay(d).getTime();
        if (prev !== null && t - prev === 86400000) {
          run++;
        } else {
          run = 1;
        }
        if (run > longestStreakDays) longestStreakDays = run;
        prev = t;
      }
    }

    const providers = Array.from(providersMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    const topWords: TopWord[] = Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const daily30 = Array.from(daily30Map.values());

    return {
      totalCount,
      totalDurationSec,
      totalWords,
      totalCost,
      averageDurationSec,
      averageWordsPerMin,
      timeSavedSec,
      streakDays,
      longestStreakDays,
      topHour,
      postProcessRate: totalCount ? postProcessed / totalCount : 0,
      providers,
      daily30,
      hourly,
      weekHourMatrix,
      topWords,
      weekdayCounts,
    };
  }, [transcriptions]);
}

export function formatDurationCompact(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 60) {
    const s = Math.round(seconds % 60);
    return s ? `${totalMin}m ${s}s` : `${totalMin}m`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
