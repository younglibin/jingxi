export class ApiError extends Error {
  constructor(
    public status: number,
    public body: {
      message: string;
      code?: string;
      fieldErrors?: { field: string; message: string }[];
    },
  ) {
    super(body.message);
  }
}
async function raw<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response
    .json()
    .catch(() => ({ message: "服务暂时无法响应，请稍后重试" }));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}
export async function csrf() {
  return raw<{ token: string; headerName: string }>("/api/auth/csrf");
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.method &&
    options.method !== "GET" &&
    !path.startsWith("/api/public/")
  ) {
    const token = await csrf();
    headers.set(token.headerName, token.token);
  }
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  return raw<T>(path, { ...options, headers });
}
export async function login(username: string, password: string): Promise<void> {
  const token = await csrf();
  await raw("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username,
      password,
      _csrf: token.token,
    }).toString(),
  });
  await csrf();
}
export function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return `${error.message}。当前输入已保留，请先重新加载并比较版本。`;
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}
