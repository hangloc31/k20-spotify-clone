import { isLoggedIn } from "../services/auth.js";
import { httpRequest } from "../services/http.js";

const VIEW_KEY = "spotify-library-view";
const VALID_VIEWS = [
  "compact-list",
  "default-list",
  "compact-grid",
  "default-grid",
];
const DEFAULT_VIEW = "default-list";

const SORT_KEY = "spotify-library-sort";
const VALID_SORTS = ["recently", "alpha", "creator"];
const DEFAULT_SORT = "recently";

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

function getSavedSort() {
  const saved = localStorage.getItem(SORT_KEY);
  return VALID_SORTS.includes(saved) ? saved : DEFAULT_SORT;
}

function stripAccent(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
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
  meta.textContent = item.owner ? `${item.type} • ${item.owner}` : item.type;
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

function createLikedCover() {
  const wrap = document.createElement("div");
  wrap.className = "library-item__cover library-item__cover--liked";
  wrap.setAttribute("aria-hidden", "true");
  const icon = document.createElement("i");
  icon.className = "ph-fill ph-heart text-[24px] leading-none";
  icon.setAttribute("aria-hidden", "true");
  wrap.appendChild(icon);
  return wrap;
}

function createLibraryItem(item, view) {
  const li = document.createElement("li");
  li.className = `library-item library-item--${item.kind}`;
  if (item.likedSongs) li.classList.add("library-item--liked");
  if (item.pinned) li.classList.add("library-item--pinned");
  if (item.id) {
    // Liked Songs is a special kind - always expose as "liked" so context-menu guard works
    li.dataset.id = item.id;
    li.dataset.kind = item.likedSongs ? "liked" : item.kind;
    li.dataset.isOwn = String(!!item.isOwn);
    li.dataset.title = item.title;
    if (item.likedSongs) li.dataset.liked = "true";
  }

  const link = document.createElement("a");
  link.className = "library-item__link";
  link.href = "#";
  link.setAttribute("aria-label", `${item.title} - ${item.type}`);
  if (item.likedSongs) {
    link.dataset.detail = "";
    link.dataset.type = "liked";
    link.dataset.title = item.title;
    link.href = "/liked";
  } else if (item.id && item.type) {
    const type = item.type.toLowerCase();
    link.dataset.detail = "";
    link.dataset.type = type;
    link.dataset.id = item.id;
    link.dataset.title = item.title;
    link.href = `/${type}/${item.id}`;
  }
  li.appendChild(link);

  const showCover = view !== "compact-list";
  if (showCover) {
    if (item.likedSongs) {
      li.appendChild(createLikedCover());
    } else {
      li.appendChild(
        createCover(item.image, `Ảnh bìa của ${item.title}`, item.round),
      );
    }
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
  const [own, followed, albums, artists, liked] = await Promise.all([
    httpRequest.get("/api/me/playlists?limit=10", { auth: true }),
    httpRequest.get("/api/me/playlists/followed?limit=10&offset=0", { auth: true }),
    httpRequest.get("/api/me/albums/liked?limit=10&offset=0", { auth: true }),
    httpRequest.get("/api/me/following?limit=10&offset=0", { auth: true }),
    httpRequest.get("/api/me/tracks/liked?limit=50", { auth: true }),
  ]);

  const items = [];
  const seen = new Set();
  const likedCount = (liked?.tracks ?? []).length;
  let savedIndex = 0;

  function pushItem(item) {
    items.push({ ...item, saved_at: Date.now() - savedIndex });
    savedIndex += 1;
  }

  (own?.playlists ?? [])
    .concat(followed?.playlists ?? [])
    .forEach((pl) => {
      if (!pl?.id || seen.has(pl.id)) return;
      seen.add(pl.id);
      const isLikedSongs = (pl.name || "").toLowerCase() === "liked songs";
      const isOwn = (own?.playlists ?? []).some((op) => op?.id === pl.id);
      pushItem({
        id: pl.id,
        kind: "playlist",
        title: isLikedSongs ? "Bài hát đã thích" : pl.name,
        type: "Playlist",
        owner: isLikedSongs
          ? `${likedCount} bài hát`
          : pl.user_username || pl.owner_name || "",
        ownerEligible: true,
        image: isLikedSongs ? null : pl.image_url,
        round: false,
        likedSongs: isLikedSongs,
        pinned: isLikedSongs,
        isOwn: isLikedSongs ? false : isOwn,
      });
    });

  // Ensure Liked Songs always exists (Spotify-like: pinned, never removable)
  const hasLiked = items.some((it) => it.likedSongs);
  if (!hasLiked) {
    pushItem({
      id: "liked",
      kind: "playlist",
      title: "Bài hát đã thích",
      type: "Playlist",
      owner: `${likedCount} bài hát`,
      ownerEligible: true,
      image: null,
      round: false,
      likedSongs: true,
      pinned: true,
      isOwn: false,
    });
  }

  (albums?.albums ?? []).forEach((al) => {
    if (!al?.id || seen.has(al.id)) return;
    seen.add(al.id);
    pushItem({
      id: al.id,
      kind: "album",
      title: al.title,
      type: "Album",
      owner: al.artist_name || "",
      ownerEligible: true,
      image: al.cover_image_url,
      round: false,
      isOwn: false,
    });
  });

  (artists?.artists ?? []).forEach((ar) => {
    if (!ar?.id || seen.has(ar.id)) return;
    seen.add(ar.id);
    pushItem({
      id: ar.id,
      kind: "artist",
      title: ar.name,
      type: "Nghệ sĩ",
      owner: ar.name,
      ownerEligible: false,
      image: ar.image_url,
      round: true,
      isOwn: false,
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

  const sortToggleBtn = document.querySelector("[data-library-sort-toggle]");
  const sortMenu = document.querySelector("[data-library-sort-menu]");

  const ctaCards = document.querySelector(".library__content");
  const searchBox = document.querySelector("[data-library-search]");
  const searchInput = document.querySelector("[data-library-search-input]");
  const chipsBox = document.querySelector("[data-library-chips]");
  ctaCards?.setAttribute("hidden", "");
  toggleBtn.removeAttribute("hidden");
  sortToggleBtn?.removeAttribute("hidden");
  list.removeAttribute("hidden");
  searchBox?.removeAttribute("hidden");
  chipsBox?.removeAttribute("hidden");

  let view = getSavedView();
  let sort = getSavedSort();
  let items = [];
  let filterType = "all";
  let searchTerm = "";

  function getFilteredItems() {
    const q = stripAccent(searchTerm.trim());
    return items.filter((it) => {
      // Liked Songs is a Playlist - visible under All and Playlists, hidden under Artists/Albums (Spotify-like)
      const isLiked = !!it.likedSongs;
      const matchType =
        filterType === "all" ||
        it.kind === filterType ||
        (isLiked && filterType === "playlist");
      const matchQuery =
        !q ||
        stripAccent(it.title).includes(q) ||
        stripAccent(it.owner).includes(q);
      return matchType && matchQuery;
    });
  }

  function getSortedItems(filtered) {
    // Pin Liked Songs at the top regardless of sort (Spotify-like)
    const pinned = filtered.filter((it) => it.pinned);
    const rest = filtered.filter((it) => !it.pinned);
    let sortedRest;
    if (sort === "alpha") {
      sortedRest = [...rest].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
    } else if (sort === "creator") {
      sortedRest = [...rest].sort((a, b) => {
        const byOwner = a.owner.localeCompare(b.owner, undefined, {
          sensitivity: "base",
        });
        if (byOwner !== 0) return byOwner;
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      });
    } else {
      sortedRest = [...rest].sort((a, b) => b.saved_at - a.saved_at);
    }
    return [...pinned, ...sortedRest];
  }

  function applyView() {
    list.dataset.view = view;
    list.className = `library__list library__list--${view}`;
    menu.querySelectorAll("[data-view-option]").forEach((option) => {
      const isActive = option.dataset.viewOption === view;
      option.setAttribute("aria-checked", String(isActive));
    });
    sortMenu?.querySelectorAll("[data-sort-option]").forEach((option) => {
      const isActive = option.dataset.sortOption === sort;
      option.setAttribute("aria-checked", String(isActive));
    });

    const visible = getSortedItems(getFilteredItems());
    list.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "library-item library-item--empty";
      empty.textContent =
        "Thư viện của bạn trống — hãy theo dõi nghệ sĩ và lưu album để xem tại đây.";
      list.appendChild(empty);
      return;
    }

    if (!visible.length) {
      const empty = document.createElement("li");
      empty.className = "library-item library-item--empty";
      empty.textContent = `Không tìm thấy kết quả cho "${searchTerm.trim()}"`;
      list.appendChild(empty);
      return;
    }

    visible.forEach((item) => list.appendChild(createLibraryItem(item, view)));
  }

  function closeMenu() {
    menu.setAttribute("hidden", "");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  function closeSortMenu() {
    sortMenu?.setAttribute("hidden", "");
    sortToggleBtn?.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeSortMenu();
    if (menu.hasAttribute("hidden")) {
      menu.removeAttribute("hidden");
      toggleBtn.setAttribute("aria-expanded", "true");
    } else {
      closeMenu();
    }
  });

  sortToggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMenu();
    if (sortMenu.hasAttribute("hidden")) {
      sortMenu.removeAttribute("hidden");
      sortToggleBtn.setAttribute("aria-expanded", "true");
    } else {
      closeSortMenu();
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

  sortMenu?.querySelectorAll("[data-sort-option]").forEach((option) => {
    option.addEventListener("click", () => {
      sort = option.dataset.sortOption;
      localStorage.setItem(SORT_KEY, sort);
      applyView();
      closeSortMenu();
    });
  });

  chipsBox?.querySelectorAll("[data-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      filterType = chip.dataset.chip;
      chipsBox.querySelectorAll("[data-chip]").forEach((c) => {
        const isActive = c.dataset.chip === filterType;
        c.classList.toggle("is-active", isActive);
        c.setAttribute("aria-pressed", String(isActive));
      });
      applyView();
    });
  });

  searchInput?.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    applyView();
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      searchTerm = "";
      applyView();
      searchInput.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!menu.hasAttribute("hidden") && !menu.contains(e.target)) closeMenu();
    if (
      sortMenu &&
      !sortMenu.hasAttribute("hidden") &&
      !sortMenu.contains(e.target)
    )
      closeSortMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      closeSortMenu();
      closeContextMenu();
    }
  });

  // ---- Context menu ----
  const contextMenu = document.getElementById("context-menu");
  let contextTarget = null;
  let toastTimer;

  function showToast(message) {
    const toastEl = document.getElementById("toast");
    if (!toastEl) return;
    const msgEl = toastEl.querySelector(".toast__message");
    if (msgEl) msgEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2500);
  }

  function closeContextMenu() {
    contextMenu?.setAttribute("hidden", "");
    contextTarget = null;
  }

  function showContextMenu(e, dataset) {
    if (!contextMenu || !dataset.id) return;
    // Liked Songs is never removable (Spotify-like) - block context menu entirely
    if (dataset.liked === "true" || dataset.kind === "liked") return;
    // idempotent: if already open on this item, toggle closed (avoid double/stacked menus)
    if (!contextMenu.hasAttribute("hidden") && contextTarget && String(contextTarget.id) === String(dataset.id)) {
      closeContextMenu();
      return;
    }
    contextTarget = { id: dataset.id, kind: dataset.kind, isOwn: dataset.isOwn === "true" };

    const isArtist = contextTarget.kind === "artist";
    const isPlaylist = contextTarget.kind === "playlist";
    const isAlbum = contextTarget.kind === "album";
    const isLikedSongs = !dataset.id || dataset.kind === "liked" || dataset.liked === "true";

    if (isLikedSongs) return;

    contextMenu.querySelector("[data-context-action='unfollow']").hidden = !isArtist;
    contextMenu.querySelector("[data-context-action='remove']").hidden = !(isPlaylist || isAlbum);
    contextMenu.querySelector("[data-context-action='delete']").hidden = !(isPlaylist && contextTarget.isOwn);

    const visibleItems = [...contextMenu.querySelectorAll(".context-menu__item:not([hidden])")];
    if (!visibleItems.length) return;

    contextMenu.removeAttribute("hidden");

    const menuRect = contextMenu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuRect.width > vw) x = vw - menuRect.width - 8;
    if (y + menuRect.height > vh) y = vh - menuRect.height - 8;
    contextMenu.style.left = `${Math.max(0, x)}px`;
    contextMenu.style.top = `${Math.max(0, y)}px`;
  }

  let touchLongPress = false;
  let suppressClick = false;
  list.addEventListener("contextmenu", (e) => {
    const li = e.target.closest(".library-item");
    if (!li) return;
    if (touchLongPress) {
      // long-press already handled via touch; ignore native contextmenu (mobile double)
      touchLongPress = false;
      return;
    }
    e.preventDefault();
    showContextMenu(e, li.dataset);
  });

  // Long-press on mobile (like Spotify) — show same context menu as right-click
  let pressTimer = null;
  let pressStartX = 0;
  let pressStartY = 0;
  list.addEventListener(
    "touchstart",
    (e) => {
      const li = e.target.closest(".library-item");
      if (!li) return;
      // menu already open (still holding from previous long-press) — don't re-arm a timer loop
      if (!contextMenu?.hasAttribute("hidden")) return;
      const t = e.touches[0];
      pressStartX = t.clientX;
      pressStartY = t.clientY;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        touchLongPress = true;
        suppressClick = true;
        showContextMenu({ clientX: pressStartX, clientY: pressStartY, preventDefault: () => {} }, li.dataset);
      }, 550);
    },
    { passive: true }
  );
  list.addEventListener(
    "touchmove",
    (e) => {
      if (!pressTimer) return;
      const t = e.touches[0];
      const dx = t.clientX - pressStartX;
      const dy = t.clientY - pressStartY;
      if (Math.hypot(dx, dy) > 10) clearTimeout(pressTimer);
    },
    { passive: true }
  );
  // block the synthetic click that fires on touchend after long-press (prevent navigate-away "freeze")
  list.addEventListener("touchend", (e) => {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (touchLongPress && e.cancelable) e.preventDefault();
  }, { passive: false });
  list.addEventListener("touchcancel", () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
  // Clear long-press flag on any tap so a following contextmenu (desktop long-click) works normally
  list.addEventListener("click", () => { touchLongPress = false; });
  // one-shot swallow ONLY the synthetic click on a library item after long-press.
  // Never swallow clicks on the context menu buttons (Remove/Delete must respond).
  document.addEventListener(
    "click",
    (e) => {
      if (suppressClick) {
        if (e.target.closest(".library-item") && !e.target.closest(".context-menu")) {
          e.preventDefault();
          e.stopPropagation();
        }
        suppressClick = false;
      }
    },
    true
  );

  contextMenu?.querySelectorAll("[data-context-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!contextTarget) return;
      const { id, kind, isOwn } = contextTarget;
      const action = btn.dataset.contextAction;
      try {
        if (action === "unfollow") {
          await httpRequest.delete(`/api/${kind}s/${id}/follow`, { auth: true });
        } else if (action === "remove") {
          if (kind === "playlist") {
            await httpRequest.delete(`/api/playlists/${id}/follow`, { auth: true });
          } else if (kind === "album") {
            await httpRequest.delete(`/api/albums/${id}/like`, { auth: true });
          }
        } else if (action === "delete") {
          await httpRequest.delete(`/api/playlists/${id}`, { auth: true });
        }
        closeContextMenu();
        window.dispatchEvent(new Event("library:refresh"));
        showToast("Đã cập nhật thư viện.");
      } catch (error) {
        showToast(error.message || "Không thể thực hiện. Vui lòng thử lại.");
        console.error(error);
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!contextMenu?.hasAttribute("hidden") && !contextMenu?.contains(e.target)) {
      closeContextMenu();
    }
  });

  // Tap outside the menu on touch closes it (mobile doesn't emit desktop-style click targets reliably)
  document.addEventListener(
    "touchend",
    (e) => {
      // release right after a long-press is not a tap-outside — keep the menu open
      if (touchLongPress) {
        touchLongPress = false;
        return;
      }
      if (!contextMenu?.hasAttribute("hidden") && !contextMenu?.contains(e.target)) {
        closeContextMenu();
      }
    },
    { passive: true }
  );

  document.addEventListener("scroll", () => closeContextMenu(), true);

  applyView();

  async function loadItems() {
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
  }

  window.addEventListener("library:refresh", () => {
    list.setAttribute("aria-busy", "true");
    loadItems();
  });

  loadItems();
}
