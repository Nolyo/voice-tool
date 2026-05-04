export type ErrorCode =
  | "missing_auth"
  | "invalid_auth"
  | "expired_auth"
  | "quota_exhausted"
  | "trial_expired"
  | "payload_too_large"
  | "unsupported_format"
  | "provider_unavailable"
  | "internal";

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  request_id?: string;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  missing_auth: 401,
  invalid_auth: 401,
  expired_auth: 401,
  quota_exhausted: 402,
  trial_expired: 402,
  payload_too_large: 413,
  unsupported_format: 415,
  provider_unavailable: 502,
  internal: 500,
};

export function errorResponse(
  code: ErrorCode,
  message: string,
  requestId?: string,
): Response {
  const body: ErrorBody = {
    error: code,
    message,
    ...(requestId ? { request_id: requestId } : {}),
  };
  return new Response(JSON.stringify(body), {
    status: STATUS_BY_CODE[code],
    headers: { "Content-Type": "application/json" },
  });
}
