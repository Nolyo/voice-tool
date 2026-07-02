import { describe, expect, it, vi } from "vitest";
import { CloudApiError } from "@/lib/cloud/errors";
import {
  StreamingUploadSession,
  type StreamingChunkPayload,
} from "./session";

function chunk(index: number): StreamingChunkPayload {
  return {
    sessionId: 1,
    chunkIndex: index,
    samples: [0, 0, 0],
    sampleRate: 48000,
    startMs: index * 1000,
    endMs: index * 1000 + 900,
  };
}

const jwtOk = async () => "jwt-token";

describe("StreamingUploadSession", () => {
  it("uploads sequentially (never more than one in flight) and in order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: number[] = [];
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: jwtOk,
      transport: async (c) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // First chunk is the slowest: sequentiality must still hold.
        await new Promise((r) => setTimeout(r, c.chunkIndex === 0 ? 30 : 1));
        order.push(c.chunkIndex);
        inFlight -= 1;
        return { text: `t${c.chunkIndex}`, duration_ms: 1000 };
      },
      onTranscript: () => {},
      onFatal: () => {},
    });

    session.enqueue(chunk(0));
    session.enqueue(chunk(1));
    session.enqueue(chunk(2));
    const outcome = await session.finish();

    expect(maxInFlight).toBe(1);
    expect(order).toEqual([0, 1, 2]);
    expect(outcome.text).toBe("t0 t1 t2");
    expect(outcome.chunksOk).toBe(3);
    expect(outcome.billedMs).toBe(3000);
    expect(outcome.aborted).toBe(false);
  });

  it("reports the assembled text after each chunk", async () => {
    const seen: string[] = [];
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: jwtOk,
      transport: async (c) => ({ text: `t${c.chunkIndex}`, duration_ms: 500 }),
      onTranscript: (text) => seen.push(text),
      onFatal: () => {},
    });
    session.enqueue(chunk(0));
    session.enqueue(chunk(1));
    await session.finish();
    expect(seen).toEqual(["t0", "t0 t1"]);
  });

  it("aborts with reason quota on a 402 and stops processing", async () => {
    const onFatal = vi.fn();
    let calls = 0;
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: jwtOk,
      transport: async () => {
        calls += 1;
        throw new CloudApiError(402, "quota_exhausted", "no minutes left");
      },
      onTranscript: () => {},
      onFatal,
    });
    session.enqueue(chunk(0));
    session.enqueue(chunk(1));
    const outcome = await session.finish();

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toBe("quota");
    expect(calls).toBe(1); // chunk 1 dropped after abort
    expect(outcome.aborted).toBe(true);
  });

  it("aborts with reason auth when no JWT is available", async () => {
    const onFatal = vi.fn();
    const transport = vi.fn();
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: async () => undefined,
      transport,
      onTranscript: () => {},
      onFatal,
    });
    session.enqueue(chunk(0));
    await session.finish();
    expect(onFatal.mock.calls[0][0]).toBe("auth");
    expect(transport).not.toHaveBeenCalled();
  });

  it("tolerates isolated failures but aborts after too many consecutive ones", async () => {
    const onFatal = vi.fn();
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: jwtOk,
      transport: async (c) => {
        if (c.chunkIndex >= 1) throw new Error("http 500");
        return { text: `t${c.chunkIndex}`, duration_ms: 700 };
      },
      onTranscript: () => {},
      onFatal,
    });
    // 0 ok, then 1, 2 fail (tolerated: max 2), 3 fails → fatal network.
    for (let i = 0; i < 4; i++) session.enqueue(chunk(i));
    const outcome = await session.finish();

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toBe("network");
    expect(outcome.aborted).toBe(true);
    expect(outcome.chunksOk).toBe(1);
  });

  it("a single failure then success leaves a gap without aborting", async () => {
    const onFatal = vi.fn();
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: jwtOk,
      transport: async (c) => {
        if (c.chunkIndex === 1) throw new Error("http 500");
        return { text: `t${c.chunkIndex}`, duration_ms: 1000 };
      },
      onTranscript: () => {},
      onFatal,
    });
    session.enqueue(chunk(0));
    session.enqueue(chunk(1));
    session.enqueue(chunk(2));
    const outcome = await session.finish();

    expect(onFatal).not.toHaveBeenCalled();
    expect(outcome.text).toBe("t0 t2");
    expect(outcome.chunksOk).toBe(2);
    expect(outcome.chunksFailed).toBe(1);
    expect(outcome.billedMs).toBe(2000); // only successful chunks are billed
    expect(outcome.aborted).toBe(false);
  });

  it("abort() drops queued chunks", async () => {
    let calls = 0;
    const session = new StreamingUploadSession({
      sessionId: 1,
      getJwt: jwtOk,
      transport: async (c) => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { text: `t${c.chunkIndex}`, duration_ms: 100 };
      },
      onTranscript: () => {},
      onFatal: () => {},
    });
    session.enqueue(chunk(0));
    session.enqueue(chunk(1));
    session.abort();
    const outcome = await session.finish();
    expect(calls).toBeLessThanOrEqual(1);
    expect(outcome.aborted).toBe(true);
  });
});
