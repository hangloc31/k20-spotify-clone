import { httpRequest, baseUrl } from "./http.js";

const SESSION_KEY = "spotify_session";

function decodeJwtExp(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
    );
    return JSON.parse(json).exp * 1000;
  } catch {
    return null;
  }
}

export function saveSession(data) {
  const session = { ...getSession() };

  if (data.access_token) {
    session.access_token = data.access_token;
    session.access_expires_at = decodeJwtExp(data.access_token);
  }
  if (data.refresh_token) {
    session.refresh_token = data.refresh_token;
    session.refresh_expires_at = decodeJwtExp(data.refresh_token);
  }
  if (data.user) {
    session.user = data.user;
  }

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    );
  }
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return getSession()?.access_token || null;
}

export function getRefreshToken() {
  return getSession()?.refresh_token || null;
}

export function isAccessTokenExpired() {
  const session = getSession();
  return (
    !session?.access_token ||
    (!!session.access_expires_at && Date.now() >= session.access_expires_at)
  );
}

export function isLoggedIn() {
  return !isAccessTokenExpired();
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function refreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");

  const data = await httpRequest.post("/api/auth/refresh-token", {}, {
    headers: { Authorization: `Bearer ${refreshToken}` },
  });

  saveSession({
    access_token: data.access_token,
    refresh_token: refreshToken,
  });
  return data.access_token;
}

export function logout() {
  const accessToken = getAccessToken();

  if (accessToken) {
    fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }

  clearSession();
  location.href = "/";
}