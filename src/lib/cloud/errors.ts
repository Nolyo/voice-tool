import type { CloudErrorBody } from "./types";

export class CloudApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CloudApiError";
  }

  static fromTauri(e: unknown): CloudApiError | Error {
    if (typeof e === "object" && e !== null && "kind" in e) {
      const body = e as CloudErrorBody;
      if (body.kind === "api") {
        return new CloudApiError(body.status, body.code, body.message);
      }
      if (body.kind === "missing_auth") {
        return new CloudApiError(401, "missing_auth", body.message);
      }
      if (body.kind === "wav_encoding") {
        return new Error(`audio encoding failed: ${body.message}`);
      }
      if (body.kind === "network") {
        return new Error(`network: ${body.message}`);
      }
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  isQuotaIssue(): boolean {
    return this.status === 402;
  }
  isAuthIssue(): boolean {
    return this.status === 401;
  }
  isProviderUnavailable(): boolean {
    return this.status === 502;
  }
}
