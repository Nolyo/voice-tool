import { describe, it, expect } from "vitest";
import { errorResponse } from "./errors";

describe("errorResponse", () => {
  it("maps bad_request to HTTP 400", () => {
    const res = errorResponse("bad_request", "missing audio part");
    expect(res.status).toBe(400);
  });

  it("maps internal to HTTP 500", () => {
    const res = errorResponse("internal", "boom");
    expect(res.status).toBe(500);
  });

  it("returns a JSON body with the error code and message", async () => {
    const res = errorResponse("bad_request", "missing audio part");
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("missing audio part");
  });

  it("includes Content-Type: application/json", () => {
    const res = errorResponse("bad_request", "x");
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});
