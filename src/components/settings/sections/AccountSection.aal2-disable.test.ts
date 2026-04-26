import { describe, expect, it, vi, beforeEach } from "vitest";

// Stub browser globals before any module under test (with its imports) is loaded.
// AccountSection's transitive imports pull in `@/i18n` which touches `localStorage`
// and `navigator` at module load time.
vi.hoisted(() => {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { language: "fr-FR" },
    configurable: true,
    writable: true,
  });
});

const mockListFactors = vi.fn();
const mockUnenroll = vi.fn();
const mockGetAal = vi.fn();
const mockChallengeAndVerify = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () => mockListFactors(),
        unenroll: (args: any) => mockUnenroll(args),
        getAuthenticatorAssuranceLevel: () => mockGetAal(),
        challengeAndVerify: (args: any) => mockChallengeAndVerify(args),
      },
    },
  },
}));

import { disableTotpFactor } from "./AccountSection";

describe("disableTotpFactor (AAL2 enforcement)", () => {
  beforeEach(() => {
    mockListFactors.mockReset();
    mockUnenroll.mockReset();
    mockGetAal.mockReset();
    mockChallengeAndVerify.mockReset();
  });

  it("refuse l'unenroll si AAL est 'aal1'", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1" }] } });
    mockGetAal.mockResolvedValue({ data: { currentLevel: "aal1" } });

    await expect(disableTotpFactor()).rejects.toThrow(/aal2-required/);
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it("appelle unenroll si la session est déjà aal2", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1" }] } });
    mockGetAal.mockResolvedValue({ data: { currentLevel: "aal2" } });
    mockUnenroll.mockResolvedValue({ data: null, error: null });

    await disableTotpFactor();
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
  });

  it("retourne sans rien faire si aucun facteur TOTP", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [] } });
    await disableTotpFactor();
    expect(mockGetAal).not.toHaveBeenCalled();
    expect(mockUnenroll).not.toHaveBeenCalled();
  });
});
