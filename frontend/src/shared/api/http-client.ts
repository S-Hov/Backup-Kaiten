import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export class ApiContractError extends Error {
  constructor(
    public readonly status: number,
    cause?: unknown,
  ) {
    super(
      "Сервер вернул данные в неожиданном формате. Обновите страницу или повторите запрос.",
      { cause },
    );
    this.name = "ApiContractError";
  }
}

export async function apiClient<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    query?: Record<string, string | number | string[]>;
    signal?: AbortSignal;
    method?: "GET" | "POST";
    body?: object;
  } = {},
): Promise<T> {
  const query = new URLSearchParams(
    Object.entries(options.query ?? {}).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value]).map((item) => [
        key,
        String(item),
      ]),
    ),
  );
  const csrf =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((value) => value.startsWith("board_csrf="))
          ?.slice("board_csrf=".length)
      : undefined;
  const response = await fetch(
    `/api/v1${path}${query.size ? `?${query}` : ""}`,
    {
      signal: options.signal,
      credentials: "same-origin",
      ...(options.method ? { method: options.method } : {}),
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.method === "POST" && csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(options.body
        ? {
            body: JSON.stringify(options.body),
          }
        : {}),
    },
  );
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    )
      throw error;
    if (!response.ok)
      throw new ApiError(
        response.status,
        `Сервер недоступен (${response.status}). Попробуйте ещё раз.`,
      );
    throw new ApiContractError(response.status, error);
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/activate", "/auth/me"].includes(path) &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("auth-expired"));
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Не удалось выполнить запрос (${response.status})`;
    throw new ApiError(response.status, message);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ApiContractError(response.status, parsed.error);
  return parsed.data;
}
