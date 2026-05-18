// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");

vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
    writable: true,
  });
  if (!("navigator" in globalThis) || !globalThis.navigator?.language) {
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "fr-FR" },
      configurable: true,
      writable: true,
    });
  }
});

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {
      input_device_index: null,
      silence_threshold: 0.005,
      language: "fr-FR",
    },
  }),
}));

type InvokeFn = (cmd: string, payload?: unknown) => Promise<unknown>;
const invokeMock = vi.fn<InvokeFn>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, payload?: unknown) => invokeMock(cmd, payload),
}));

type ListenFn = (event: string, handler: unknown) => Promise<() => void>;
const listenMock = vi.fn<ListenFn>();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: unknown) => listenMock(event, handler),
}));

const submitDemo = vi.fn();
vi.mock("@/lib/demo-transcribe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/demo-transcribe")>(
    "@/lib/demo-transcribe",
  );
  return {
    ...actual,
    submitDemoTranscription: (args: unknown) => submitDemo(args),
  };
});

const getDeviceId = vi.fn(() => Promise.resolve("dev-uuid-12345678"));
vi.mock("@/lib/device-id", () => ({
  getDemoDeviceId: () => getDeviceId(),
}));

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  listenMock.mockImplementation(() => Promise.resolve(() => {}));
  submitDemo.mockReset();
  getDeviceId.mockReset();
  getDeviceId.mockResolvedValue("dev-uuid-12345678");
});

import "@/i18n";
import { TryItStep } from "./TryItStep";

const renderStep = (overrides: Partial<Parameters<typeof TryItStep>[0]> = {}) =>
  render(
    <TryItStep
      onCloud={vi.fn()}
      onLocal={vi.fn()}
      onLater={vi.fn()}
      onSkip={vi.fn()}
      onBack={vi.fn()}
      {...overrides}
    />,
  );

describe("TryItStep", () => {
  it("renders idle state with record button + back/skip controls", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Retour|Back/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sauter|Skip the demo/i }),
    ).toBeInTheDocument();
  });

  it("calls onBack and onSkip from idle", () => {
    const onBack = vi.fn();
    const onSkip = vi.fn();
    renderStep({ onBack, onSkip });
    fireEvent.click(screen.getByRole("button", { name: /Retour|Back/i }));
    expect(onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Sauter|Skip the demo/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("transitions idle → recording on start", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      return Promise.reject(new Error("unexpected cmd"));
    });
    renderStep();
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument();
    });
    expect(invokeMock).toHaveBeenCalledWith("start_recording", expect.any(Object));
  });

  it("shows error on bad_request when audio is silent", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      if (cmd === "stop_recording")
        return Promise.resolve({
          audio_data: [0, 0, 0],
          sample_rate: 16000,
          avg_rms: 0,
          is_silent: true,
        });
      return Promise.reject(new Error("unexpected cmd"));
    });
    renderStep();
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Arrêter|Stop/i }));
    await waitFor(() => {
      expect(screen.getByText(/Je n'ai rien entendu|didn't hear/i)).toBeInTheDocument();
    });
    expect(submitDemo).not.toHaveBeenCalled();
  });

  it("idle → success path renders transcription + cloud CTA", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      if (cmd === "stop_recording")
        return Promise.resolve({
          audio_data: new Array(16000).fill(1000),
          sample_rate: 16000,
          avg_rms: 0.5,
          is_silent: false,
        });
      return Promise.reject(new Error("unexpected cmd"));
    });
    submitDemo.mockResolvedValue({ text: "bonjour le monde", duration_ms: 1200 });
    renderStep();
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Arrêter|Stop/i }));
    await waitFor(() => {
      expect(screen.getByText("bonjour le monde")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Crée mon compte|Create my free account/i }),
    ).toBeInTheDocument();
    expect(submitDemo).toHaveBeenCalledTimes(1);
  });

  it("rate-limited error shows signup CTA + skip", async () => {
    const { DemoTranscribeError } = await import("@/lib/demo-transcribe");
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      if (cmd === "stop_recording")
        return Promise.resolve({
          audio_data: new Array(16000).fill(1000),
          sample_rate: 16000,
          avg_rms: 0.5,
          is_silent: false,
        });
      return Promise.reject(new Error("unexpected cmd"));
    });
    submitDemo.mockRejectedValue(
      new DemoTranscribeError("rate_limited", "exceeded", 429),
    );
    const onCloud = vi.fn();
    renderStep({ onCloud });
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Arrêter|Stop/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/atteint la limite|reached the free demo limit/i),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Crée mon compte|Create my free account/i }),
    );
    expect(onCloud).toHaveBeenCalled();
  });

  it("generic error shows retry button + back + skip", async () => {
    const { DemoTranscribeError } = await import("@/lib/demo-transcribe");
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      if (cmd === "stop_recording")
        return Promise.resolve({
          audio_data: new Array(16000).fill(1000),
          sample_rate: 16000,
          avg_rms: 0.5,
          is_silent: false,
        });
      return Promise.reject(new Error("unexpected cmd"));
    });
    submitDemo.mockRejectedValue(
      new DemoTranscribeError("network", "offline"),
    );
    renderStep();
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Arrêter|Stop/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Réessayer|Try again/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Réessayer|Try again/i }));
    // Retry sends us back to idle.
    expect(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    ).toBeInTheDocument();
  });

  it("success → cloud CTA calls onCloud", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      if (cmd === "stop_recording")
        return Promise.resolve({
          audio_data: new Array(16000).fill(1000),
          sample_rate: 16000,
          avg_rms: 0.5,
          is_silent: false,
        });
      return Promise.reject(new Error("unexpected cmd"));
    });
    submitDemo.mockResolvedValue({ text: "salut", duration_ms: 800 });
    const onCloud = vi.fn();
    renderStep({ onCloud });
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Arrêter|Stop/i }));
    await waitFor(() => expect(screen.getByText("salut")).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole("button", { name: /Crée mon compte|Create my free account/i }),
    );
    expect(onCloud).toHaveBeenCalled();
  });

  it("success → local link calls onLocal", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_recording") return Promise.resolve();
      if (cmd === "stop_recording")
        return Promise.resolve({
          audio_data: new Array(16000).fill(1000),
          sample_rate: 16000,
          avg_rms: 0.5,
          is_silent: false,
        });
      return Promise.reject(new Error("unexpected cmd"));
    });
    submitDemo.mockResolvedValue({ text: "salut", duration_ms: 800 });
    const onLocal = vi.fn();
    renderStep({ onLocal });
    fireEvent.click(
      screen.getByRole("button", { name: /Démarrer|Start recording/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Arrêter|Stop/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Arrêter|Stop/i }));
    await waitFor(() => expect(screen.getByText("salut")).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole("button", { name: /Continuer en local|Continue with local/i }),
    );
    expect(onLocal).toHaveBeenCalled();
  });
});
