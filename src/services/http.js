export const baseUrl = import.meta.env.VITE_API_BASE_URL || "https://spotify.f8team.dev";

export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function doFetch(url, fetchOptions, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${baseUrl}${url}`, {
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!res.ok) {
      let serverMessage = `${fetchOptions.method || "GET"} ${url} (${res.status})`;
      let serverCode = null;
      let serverDetails = null;

      try {
        const body = await res.json();
        serverCode = body?.error?.code || null;
        serverMessage = body?.error?.message || body?.message || serverMessage;
        serverDetails = body?.error?.details || null;
      } catch {}

      throw new HttpError(res.status, serverMessage, serverCode, serverDetails);
    }

    return res.status === 204 ? null : res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function request(url, options = {}, timeout = 10000) {
  const { auth = false, ...fetchOptions } = options;

  const headers = { ...fetchOptions.headers };

  if (auth) {
    const { getAccessToken } = await import("./auth.js");
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    return await doFetch(url, { ...fetchOptions, headers }, timeout);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401 && auth) {
      try {
        const { refreshToken, getAccessToken } = await import("./auth.js");
        await refreshToken();
        const newToken = getAccessToken();
        if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
      } catch {
        const { clearSession } = await import("./auth.js");
        clearSession();
        location.href = `/login.html?message=${encodeURIComponent("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")}`;
        throw error;
      }

      return doFetch(url, { ...fetchOptions, headers }, timeout);
    }

    throw error;
  }
}

export const httpRequest = {
  get: (url, options) => request(url, options),

  post: (url, body, options) =>
    request(url, {
      ...options,
      method: "POST",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: JSON.stringify(body),
    }),
};
