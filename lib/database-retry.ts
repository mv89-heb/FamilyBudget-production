type RetryOptions = {
  delaysMs?: readonly number[];
  onRetry?: (message: string) => void;
};

const TRANSIENT_PRISMA_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const TRANSIENT_NETWORK_PATTERNS = [
  /connection (?:closed|reset|terminated)/i,
  /postgresql connection:\\s*closed/i,
  /server has closed the connection/i,
  /socket hang up/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /connection timed out/i,
];

function errorDetails(error: unknown): { code?: string; message: string } {
  if (typeof error === "string") return { message: error };
  if (!error || typeof error !== "object") return { message: String(error) };

  const value = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown };
    cause?: unknown;
  };
  const ownCode = typeof value.code === "string"
    ? value.code
    : typeof value.meta?.code === "string"
      ? value.meta.code
      : undefined;
  const ownMessage = typeof value.message === "string" ? value.message : "";
  const cause = value.cause ? errorDetails(value.cause) : undefined;

  return {
    code: ownCode ?? cause?.code,
    message: [ownMessage, cause?.message].filter(Boolean).join(" "),
  };
}

export function isTransientDatabaseError(error: unknown): boolean {
  const details = errorDetails(error);
  return Boolean(
    (details.code && TRANSIENT_PRISMA_CODES.has(details.code)) ||
    TRANSIENT_NETWORK_PATTERNS.some((pattern) => pattern.test(details.message)),
  );
}

export async function withDatabaseReadRetry<T>(
  operation: string,
  run: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? [500, 1_500];

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isTransientDatabaseError(error)) {
        throw error;
      }

      options.onRetry?.(
        `Transient database read failure in ${operation}; retry ${attempt + 1}/${delays.length} in ${delay}ms`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
