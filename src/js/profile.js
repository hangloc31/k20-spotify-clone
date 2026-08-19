import { httpRequest, HttpError } from "../services/http.js";
import { ensureSession, initAuthUI } from "./authUI.js";

const cardAvatarImg = document.querySelector("[data-card-avatar-img]");
const cardAvatarInitial = document.querySelector("[data-card-avatar-initial]");
const nameEl = document.querySelector("[data-display-name]");
const usernameEl = document.querySelector("[data-username]");
const joinedEl = document.querySelector("[data-joined]");
const emailEl = document.querySelector("[data-email]");
const statPlaylists = document.querySelector("[data-stat-playlists]");
const statFollowing = document.querySelector("[data-stat-following]");
const statPlays = document.querySelector("[data-stat-plays]");
const errorEl = document.querySelector(".profile-card__error");
const card = document.querySelector(".profile-card");

const sessionStatus = await ensureSession();
initAuthUI();

if (sessionStatus === "guest") {
  location.href = "/login.html?message=Vui lòng đăng nhập.";
}

function setError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function formatJoined(iso) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "long",
    });
  } catch {
    return "";
  }
}

function renderAvatar(user, name) {
  const initial = (name.charAt(0) || "?").toUpperCase();
  if (user.avatar_url) {
    cardAvatarImg.src = user.avatar_url;
    cardAvatarImg.alt = name;
    cardAvatarImg.removeAttribute("hidden");
    cardAvatarInitial?.setAttribute("hidden", "");
  } else if (cardAvatarInitial) {
    cardAvatarInitial.textContent = initial;
    cardAvatarImg?.setAttribute("hidden", "");
  }
}

async function loadProfile() {
  card?.setAttribute("aria-busy", "true");

  try {
    const data = await httpRequest.get("/api/users/me", { auth: true });
    const user = data.user;
    const stats = data.stats || {};

    const name = user.display_name || user.username || user.email || "";

    if (nameEl) nameEl.textContent = name;
    if (usernameEl)
      usernameEl.textContent = user.username ? `@${user.username}` : "";
    if (joinedEl)
      joinedEl.textContent = user.created_at
        ? `Đã tham gia ${formatJoined(user.created_at)}`
        : "";
    if (emailEl) emailEl.textContent = user.email || "";

    renderAvatar(user, name);

    if (statPlaylists) statPlaylists.textContent = stats.playlists ?? 0;
    if (statFollowing) statFollowing.textContent = stats.following ?? 0;
    if (statPlays) statPlays.textContent = stats.plays ?? 0;
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      setError(error.message);
    } else {
      setError("Không thể tải hồ sơ. Vui lòng thử lại.");
    }
  } finally {
    card?.removeAttribute("aria-busy");
  }
}

loadProfile();