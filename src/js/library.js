import { isLoggedIn } from "../services/auth.js";
import { httpRequest } from "../services/http.js";

const VIEW_KEY = "spotify-library-view";
const VALID_VIEWS = ["compact-list", "default-list", "compact-grid", "default-grid"];
const DEFAULT_VIEW = "default-list";

function isValidCoverUrl(src) {
  if (!src) return false;
  if (src.length > 2000) return false;
  if (src.startsWith("data:")) return false;
  if (src.includes("devdata:")) return false;
  return true;
}

function getSavedView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return VALID_VIEWS.includes(saved) ? saved : DEFAULT_VIEW;
}

function createCoverFallback() {
  const fallback = document.createElement("div");
  fallback.className = "library-item__cover-fallback";

  const icon = document.createElement("i");
  icon.className = "ph-fill ph-music-notes text-[20px] leading-none";
  icon.setAttribute("aria-hidden", "true");
  fallback.appendChild(icon);

  return fallback;
}

function createCover(src, alt, round) {
  const wrap = document.createElement("div");
  wrap.className = `library-item__cover${round ? " library-item__cover--round" : ""}`;

  if (!isValidCoverUrl(src)) {
    wrap.appendChild(createCoverFallback());
    return wrap;
  }

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "lazy";
  img.width = 48;
  img.height = 48;
  img.addEventListener("error", () => {
    img.replaceWith(createCoverFallback());
  });
  wrap.appendChild(img);
  return wrap;
}

function createOverlay(item) {
  const overlay = document.createElement("div");
  overlay.className = "library-item__overlay";

  const title = document.createElement("p");
  title.className = "library-item__overlay-title";
  title.textContent = item.title;
  overlay.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "library-item__overlay-meta";
  meta.textContent = item.owner
    ? `${item.type} • ${item.owner}`
    : item.type;
  overlay.appendChild(meta);

  return overlay;
}

function createBody(item) {
  const body = document.createElement("div");
  body.className = "library-item__body";

  const title = document.createElement("a");
  title.className = "library-item__title";
  title.href = "#";
  title.textContent = item.title;
  body.appendChild(title);

  const type = document.createElement("p");
  type.className = "library-item__type";
  type.textContent = item.type;
  body.appendChild(type);

  if (item.owner && item.ownerEligible) {
    const owner = document.createElement("p");
    owner.className = "library-item__owner";
    owner.textContent = item.owner;
    body.appendChild(owner);
  }

  return body;
}

function createLibraryItem(item, view) {
  const li = document.createElement("li");
  li.className = `library-item library-item--${item.kind}`;

  const link = document.createElement("a");
  link.className = "library-item__link";
  link.href = "#";
  link.setAttribute("aria-label", `${item.title} - ${item.type}`);
  li.appendChild(link);

  const showCover = view !== "compact-list";
  if (showCover) {
    li.appendChild(createCover(item.image, `Cover of ${item.title}`, item.round));
  }

  if (view === "default-list" || view === "default-grid") {
    li.appendChild(createBody(item));
  } else if (view === "compact-list") {
    const mini = document.createElement("div");
    mini.className = "library-item__body";

    const title = document.createElement("span");
    title.className = "library-item__title";
    title.textContent = item.title;
    mini.appendChild(title);

    const type = document.createElement("span");
    type.className = "library-item__type";
    type.textContent = item.type;
    mini.appendChild(type);

    li.appendChild(mini);
  } else if (view === "compact-grid") {
    li.appendChild(createOverlay(item));
  }

  return li;
}

async function fetchLibraryItems() {
  const [playlists, artists, albums] = await Promise.all([
    httpRequest.get("/api/playlists?limit=5&offset=0"),
    httpRequest.get("/api/artists?limit=3"),
    httpRequest.get("/api/albums/popular?limit=3"),
  ]);

  const items = [];

  (playlists?.playlists ?? []).forEach((pl) => {
    items.push({
      kind: "playlist",
      title: pl.name,
      type: "Playlist",
      owner: pl.user_username || pl.owner_name || "",
      ownerEligible: true,
      image: pl.image_url,
      round: false,
    });
  });

  (artists?.artists ?? []).forEach((ar) => {
    items.push({
      kind: "artist",
      title: ar.name,
      type: "Artist",
      owner: ar.name,
      ownerEligible: false,
      image: ar.image_url,
      round: true,
    });
  });

  (albums?.albums ?? []).forEach((al) => {
    items.push({
      kind: "album",
      title: al.title,
      type: "Album",
      owner: al.artist_name || "",
      ownerEligible: true,
      image: al.cover_image_url,
      round: false,
    });
  });

  return items;
}

export function initLibrary() {
  if (!isLoggedIn()) return;

  const list = document.querySelector("[data-library-list]");
  const toggleBtn = document.querySelector("[data-library-view-toggle]");
  const menu = document.querySelector("[data-library-view-menu]");
  if (!list || !toggleBtn || !menu) return;

  const ctaCards = document.querySelector(".library__content");
  ctaCards?.setAttribute("hidden", "");
  toggleBtn.removeAttribute("hidden");
  list.removeAttribute("hidden");

  let view = getSavedView();
  let items = [];

  function applyView() {
    list.dataset.view = view;
    list.className = `library__list library__list--${view}`;
    menu.querySelectorAll("[data-view-option]").forEach((option) => {
      const isActive = option.dataset.viewOption === view;
      option.setAttribute("aria-checked", String(isActive));
    });

    if (!items.length) return;
    list.innerHTML = "";
    items.forEach((item) => list.appendChild(createLibraryItem(item, view)));
  }

  function closeMenu() {
    menu.setAttribute("hidden", "");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hasAttribute("hidden")) {
      menu.removeAttribute("hidden");
      toggleBtn.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });

  menu.querySelectorAll("[data-view-option]").forEach((option) => {
    option.addEventListener("click", () => {
      view = option.dataset.viewOption;
      localStorage.setItem(VIEW_KEY, view);
      applyView();
      closeMenu();
    });
  });

  document.addEventListener("click", (e) => {
    if (!menu.hasAttribute("hidden") && !menu.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  applyView();

  (async () => {
    try {
      items = await fetchLibraryItems();
      list.removeAttribute("aria-busy");
      applyView();
    } catch (error) {
      list.removeAttribute("aria-busy");
      list.innerHTML = "";
      const fallback = document.createElement("li");
      fallback.className = "library-item";
      fallback.textContent = "Không thể tải thư viện. Vui lòng thử lại.";
      list.appendChild(fallback);
      console.error(error);
    }
  })();
}
