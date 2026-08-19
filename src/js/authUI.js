import {
  isLoggedIn,
  isAccessTokenExpired,
  refreshToken,
  logout,
  getSession,
  clearSession,
} from "../services/auth.js";

export async function ensureSession() {
  if (!getSession()?.access_token) return "guest";
  if (!isAccessTokenExpired()) return "valid";
  try {
    await refreshToken();
    return "refreshed";
  } catch {
    clearSession();
    location.href = `/login.html?message=${encodeURIComponent("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")}`;
    return "expired";
  }
}

export function initAuthUI() {
  document.body.classList.toggle("is-logged-in", isLoggedIn());

  const guest = document.querySelector("[data-auth-guest]");
  const userBox = document.querySelector("[data-auth-user]");
  const avatarImg = document.querySelector("[data-avatar-img]");
  const avatarInitial = document.querySelector("[data-avatar-initial]");
  const menu = document.querySelector("[data-user-menu]");
  const toggle = document.querySelector("[data-avatar-toggle]");
  const logoutBtn = document.querySelector("[data-logout]");

  if (!isLoggedIn() || !userBox) return;

  const session = getSession();
  if (!session?.user) return;

  guest?.setAttribute("hidden", "");
  userBox.removeAttribute("hidden");

  const user = session.user;
  const name = user.display_name || user.username || user.email || "";
  const initial = (name.charAt(0) || "?").toUpperCase();

  if (user.avatar_url && avatarImg) {
    avatarImg.src = user.avatar_url;
    avatarImg.alt = name;
    avatarImg.removeAttribute("hidden");
    avatarInitial?.setAttribute("hidden", "");
  } else if (avatarInitial) {
    avatarInitial.textContent = initial;
    avatarImg?.setAttribute("hidden", "");
  }

  const nameEl = document.querySelector("[data-user-name]");
  const emailEl = document.querySelector("[data-user-email]");
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = user.email || user.username || "";

  function closeMenu() {
    menu?.setAttribute("hidden", "");
    toggle?.setAttribute("aria-expanded", "false");
  }

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = menu?.hasAttribute("hidden");
    if (isHidden) {
      menu?.removeAttribute("hidden");
      toggle?.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });

  document.addEventListener("click", (e) => {
    if (!userBox?.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  logoutBtn?.addEventListener("click", () => {
    logout();
  });
}
