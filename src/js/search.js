import { httpRequest } from "../services/http.js";

const form = document.querySelector(".top-bar__search");
const input = document.querySelector(".top-bar__search-input");
const browseBtn = document.querySelector(".top-bar__search-browse");
const suggestionsEl = document.getElementById("search-suggestions");
const resultsEl = document.getElementById("search-results");
const detailView = document.getElementById("detail-view");
const homeContent = document.querySelector(".app-main__content");
const homeLink = document.querySelector("[data-home-link]");
const center = document.querySelector(".top-bar__center");

let trendingCache = null;
let trendingFetching = false;
let searchController = null;
let trendingController = null;
let debounceTimer = null;

function debounce(fn, delay) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delay);
  };
}

function hide(el) {
  if (el) el.hidden = true;
}

function show(el) {
  if (el) el.hidden = false;
}

function clearEl(el) {
  if (el) el.innerHTML = "";
}

function hideAllDropdowns() {
  hide(suggestionsEl);
  hide(resultsEl);
}

function showHome() {
  if (homeContent) homeContent.hidden = false;
  if (homeContent) homeContent.classList.remove("hidden");
  if (detailView) {
    detailView.hidden = true;
    detailView.classList.add("hidden");
    detailView.innerHTML = "";
  }
  history.pushState(null, "", "/");
}

function showDetail() {
  if (homeContent) {
    homeContent.hidden = true;
    homeContent.classList.add("hidden");
  }
  if (detailView) {
    detailView.hidden = false;
    detailView.classList.remove("hidden");
  }
  hideAllDropdowns();
}

function createRow({ id, title, subtitle, image_url, type }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "search-row";
  btn.setAttribute("role", "option");
  btn.dataset.type = type;
  btn.dataset.id = id;

  const imgWrap = document.createElement("div");
  imgWrap.className = "search-row__img-wrap";
  const img = document.createElement("img");
  img.className = "search-row__img" + (type === "artist" ? " search-row__img--round" : "");
  img.src = image_url || "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg";
  img.alt = "";
  img.loading = "lazy";
  img.width = 40;
  img.height = 40;
  img.addEventListener("error", () => {
    img.src = "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg";
  });
  imgWrap.appendChild(img);

  const body = document.createElement("div");
  body.className = "search-row__body";
  const t = document.createElement("span");
  t.className = "search-row__title";
  t.textContent = title || "Untitled";
  const s = document.createElement("span");
  s.className = "search-row__subtitle";
  s.textContent = subtitle || type;
  body.append(t, s);

  const badge = document.createElement("span");
  badge.className = "search-row__badge";
  badge.textContent = type;

  btn.append(imgWrap, body, badge);
  btn.addEventListener("click", () => {
    if (type === "trending") {
      input.value = title;
      input.focus();
      hide(suggestionsEl);
      fetchSearch(title);
    } else {
      navigateToDetail(type, id, title);
    }
  });
  return btn;
}

function extractTrendingItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.trending_searches)) {
    return data.trending_searches.map((q) => ({
      id: q,
      title: q,
      subtitle: "Trending",
      image_url: "",
      type: "trending",
    }));
  }
  if (Array.isArray(data.trending)) return data.trending;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  if (data.results && typeof data.results === "object") {
    // grouped object like { tracks:[], artists:[] }
    const out = [];
    for (const [type, arr] of Object.entries(data.results)) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          out.push({
            id: item.id || item._id,
            title: item.title || item.name || "Untitled",
            subtitle: item.subtitle || item.artist_name || item.description || type,
            image_url: item.image_url || item.cover_image_url || item.avatar || "",
            type: (item.type || type.replace(/s$/, "")) .toLowerCase(),
          });
        }
      }
    }
    return out;
  }
  return [];
}

function extractSearchItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.results && typeof data.results === "object" && !Array.isArray(data.results)) {
    return extractTrendingItems(data);
  }
  if (Array.isArray(data.tracks) || Array.isArray(data.artists)) {
    const out = [];
    for (const key of ["tracks", "artists", "albums", "playlists"]) {
      const arr = data[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          out.push({
            id: item.id,
            title: item.title || item.name || "Untitled",
            subtitle: item.artist_name || item.description || item.bio || key.slice(0, -1),
            image_url: item.image_url || item.cover_image_url || "",
            type: key.slice(0, -1),
          });
        }
      }
    }
    return out;
  }
  return extractTrendingItems(data);
}

function renderList(el, items, emptyText) {
  clearEl(el);
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "search-dropdown__empty";
    p.textContent = emptyText;
    el.appendChild(p);
    return;
  }
  for (const item of items) {
    if (!item.id) continue;
    el.appendChild(createRow(item));
  }
}

async function fetchTrending() {
  if (trendingCache) {
    renderList(suggestionsEl, trendingCache, "Không có gợi ý");
    show(suggestionsEl);
    hide(resultsEl);
    return;
  }
  if (trendingFetching) return;
  trendingFetching = true;
  if (trendingController) trendingController.abort();
  trendingController = new AbortController();
  try {
    const data = await httpRequest.get("/api/search/trending?limit=10", {
      signal: trendingController.signal,
    });
    const items = extractTrendingItems(data).slice(0, 10).map((it) => ({
      ...it,
      type: (it.type || "track").toLowerCase(),
    }));
    trendingCache = items;
    renderList(suggestionsEl, items, "Không có gợi ý");
    // only show if input still focused and empty
    if (document.activeElement === input && !input.value.trim()) {
      show(suggestionsEl);
      hide(resultsEl);
    }
  } catch (e) {
    if (e.name === "AbortError") return;
    // fallback: try trending artists as suggestions
    try {
      const data = await httpRequest.get("/api/artists/trending?limit=10");
      const items = (data.artists || []).map((a) => ({
        id: a.id,
        title: a.name,
        subtitle: "Artist",
        image_url: a.image_url,
        type: "artist",
      }));
      trendingCache = items;
      renderList(suggestionsEl, items, "Không có gợi ý");
      if (document.activeElement === input && !input.value.trim()) {
        show(suggestionsEl);
        hide(resultsEl);
      }
    } catch {}
  } finally {
    trendingFetching = false;
  }
}

async function fetchSearch(q) {
  if (!q) {
    hide(resultsEl);
    return;
  }
  if (searchController) searchController.abort();
  searchController = new AbortController();
  try {
    const data = await httpRequest.get(
      `/api/search?q=${encodeURIComponent(q)}&type=all&limit=20&offset=0`,
      { signal: searchController.signal }
    );
    const items = extractSearchItems(data);
    renderList(resultsEl, items, `Không có kết quả cho "${q}"`);
    show(resultsEl);
    hide(suggestionsEl);
  } catch (e) {
    if (e.name === "AbortError") return;
    renderList(resultsEl, [], `Không có kết quả cho "${q}"`);
    show(resultsEl);
    hide(suggestionsEl);
  }
}

const debouncedSearch = debounce((q) => {
  if (!q) {
    hide(resultsEl);
    if (document.activeElement === input) fetchTrending();
    return;
  }
  fetchSearch(q);
}, 300);

export function navigateToDetail(type, id, fallbackTitle) {
  hideAllDropdowns();
  input.blur();
  const cleanType = (type || "playlist").toLowerCase();
  if (cleanType === "liked") {
    history.pushState({ type: "liked" }, "", "/liked");
    renderLikedSongs();
    return;
  }
  // normalize plural
  const singular = cleanType.endsWith("s") ? cleanType.slice(0, -1) : cleanType;
  const url = `/${singular}/${id}`;
  history.pushState({ type: singular, id }, "", url);
  renderDetail(singular, id, fallbackTitle);
}

async function renderDetail(type, id, fallbackTitle) {
  showDetail();
  detailView.innerHTML = `<div class="detail-loading"><p class="text-white">Đang tải...</p></div>`;

  const endpointMap = {
    playlist: `/api/playlists/${id}`,
    artist: `/api/artists/${id}`,
    album: `/api/albums/${id}`,
    track: `/api/tracks/${id}`,
  };
  const endpoint = endpointMap[type] || `/api/playlists/${id}`;

  try {
    const data = await httpRequest.get(endpoint, { auth: true });
    const entity = data.playlist || data.artist || data.album || data.track || data.data || data;
    const title = entity.title || entity.name || fallbackTitle || "Untitled";
    const subtitle = entity.description || entity.bio || entity.artist_name || "";
    const cover = entity.image_url || entity.cover_image_url || entity.background_image_url || "";
    const tracks = entity.tracks || [];

    const isFollow = type === "artist" || type === "playlist";
    const isLike = type === "album" || type === "track";
    const followable = isFollow || isLike;
    let following = !!(isFollow ? entity.is_following : entity.is_liked);

    const followBtn = followable
      ? isFollow
        ? `<button class="pill-button ${following ? "pill-button--ghost" : "pill-button--white"} px-4 py-2 text-sm" type="button" data-detail-follow aria-pressed="${following}">${following ? "Following" : "Follow"}</button>`
        : `<button class="detail-heart${following ? " is-active" : ""}" type="button" data-detail-follow aria-label="${following ? "Remove from Liked Songs" : "Save to Liked Songs"}" aria-pressed="${following}"><i class="ph-fill ph-heart text-[24px] leading-none" aria-hidden="true"></i></button>`
      : "";

    detailView.innerHTML = `
      <button class="detail-back pill-button pill-button--ghost px-3 py-2 text-sm mb-4" data-detail-back>
        <i class="ph-fill ph-arrow-left text-[16px] leading-none" aria-hidden="true"></i>
        <span>Quay lại</span>
      </button>
      <div class="detail-header flex gap-6 p-6 rounded-lg bg-elevated">
        <img src="${cover || "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg"}" alt="" class="detail-cover w-48 h-48 rounded-md object-cover shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold uppercase text-subdued">${type}</p>
          <h1 class="detail-title mt-2 text-3xl font-extrabold text-white">${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="detail-subtitle mt-2 text-sm text-subdued line-clamp-3">${escapeHtml(subtitle)}</p>` : ""}
          ${entity.user_display_name ? `<p class="mt-2 text-sm text-white">By ${escapeHtml(entity.user_display_name)}</p>` : ""}
          ${entity.monthly_listeners ? `<p class="mt-2 text-sm text-subdued">${Number(entity.monthly_listeners).toLocaleString("vi-VN")} monthly listeners</p>` : ""}
          ${followBtn ? `<div class="detail-actions mt-4 flex items-center gap-3">${followBtn}</div>` : ""}
        </div>
      </div>
      ${tracks.length ? `<div class="detail-tracks mt-6"><h2 class="text-lg font-bold text-white mb-3">Tracks</h2><ul class="flex flex-col gap-1">${tracks.map((t, i) => `<li class="flex items-center gap-3 p-2 rounded hover:bg-elevated text-sm text-white"><span class="w-6 text-subdued">${i + 1}</span><span class="truncate">${escapeHtml(t.title || t.name || "Track")}</span><span class="ml-auto text-subdued">${t.artist_name || ""}</span></li>`).join("")}</ul></div>` : ""}
    `;
    detailView.querySelector("[data-detail-back]")?.addEventListener("click", () => {
      history.back();
    });

    const followEl = detailView.querySelector("[data-detail-follow]");
    if (followable && followEl) {
      const updateFollowBtn = () => {
        if (isFollow) {
          followEl.className = `pill-button ${following ? "pill-button--ghost" : "pill-button--white"} px-4 py-2 text-sm`;
          followEl.textContent = following ? "Following" : "Follow";
          followEl.setAttribute("aria-pressed", String(following));
        } else {
          followEl.classList.toggle("is-active", following);
          followEl.setAttribute("aria-pressed", String(following));
          followEl.setAttribute(
            "aria-label",
            following ? "Remove from Liked Songs" : "Save to Liked Songs",
          );
        }
      };

      followEl.addEventListener("click", async () => {
        const url = isFollow
          ? `/api/${type}s/${id}/follow`
          : `/api/${type}s/${id}/like`;
        try {
          if (following) {
            await httpRequest.delete(url, { auth: true });
          } else {
            await httpRequest.post(url, {}, { auth: true });
          }
          following = !following;
          updateFollowBtn();
          window.dispatchEvent(new Event("library:refresh"));
        } catch (error) {
          showToast(error.message || "Không thể cập nhật. Vui lòng thử lại.");
        }
      });
    }
  } catch (e) {
    detailView.innerHTML = `
      <button class="detail-back pill-button pill-button--ghost px-3 py-2 text-sm mb-4" data-detail-back>
        <i class="ph-fill ph-arrow-left text-[16px] leading-none" aria-hidden="true"></i>
        <span>Quay lại</span>
      </button>
      <p class="text-subdued">Không thể tải chi tiết. ${escapeHtml(e.message || "")}</p>
    `;
    detailView.querySelector("[data-detail-back]")?.addEventListener("click", () => history.back());
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDuration(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function renderLikedSongs() {
  showDetail();
  detailView.innerHTML = `<div class="detail-loading"><p class="text-white">Đang tải...</p></div>`;

  try {
    const data = await httpRequest.get("/api/me/tracks/liked?limit=50", { auth: true });
    const tracks = data.tracks || [];
    const countText = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;

    detailView.innerHTML = `
      <button class="detail-back pill-button pill-button--ghost px-3 py-2 text-sm mb-4" data-detail-back>
        <i class="ph-fill ph-arrow-left text-[16px] leading-none" aria-hidden="true"></i>
        <span>Quay lại</span>
      </button>
      <div class="detail-header flex gap-6 p-6 rounded-lg bg-elevated">
        <div class="liked-cover shrink-0" aria-hidden="true">
          <i class="ph-fill ph-heart text-[32px] leading-none"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold uppercase text-subdued">Playlist</p>
          <h1 class="detail-title mt-2 text-3xl font-extrabold text-white">Liked Songs</h1>
          <p class="mt-2 text-sm text-subdued">${countText}</p>
        </div>
      </div>
      <div class="detail-tracks mt-6">
        <h2 class="text-lg font-bold text-white mb-3">Tracks</h2>
        <ul class="flex flex-col gap-1" data-liked-list>
          ${tracks.length ? tracks.map((t, i) => `
            <li class="flex items-center gap-3 p-2 rounded hover:bg-elevated text-sm text-white" data-track-id="${escapeHtml(t.id)}">
              <span class="w-6 text-subdued">${i + 1}</span>
              <img src="${escapeHtml(t.image_url || t.album_cover_image_url || "")}" alt="" class="liked-track-cover" width="40" height="40" loading="lazy" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">${escapeHtml(t.title || "Track")}</p>
                <p class="truncate text-subdued">${escapeHtml(t.artist_name || "")}</p>
              </div>
              ${t.duration ? `<span class="text-subdued">${formatDuration(t.duration)}</span>` : ""}
              <button class="detail-heart is-active" type="button" data-liked-unlike aria-label="Remove from Liked Songs" aria-pressed="true">
                <i class="ph-fill ph-heart text-[20px] leading-none" aria-hidden="true"></i>
              </button>
            </li>`).join("") : `<li class="p-2 text-subdued text-sm">No liked songs yet.</li>`}
        </ul>
      </div>
    `;

    detailView.querySelector("[data-detail-back]")?.addEventListener("click", () => history.back());

    detailView.querySelectorAll("[data-liked-unlike]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("[data-track-id]");
        const trackId = row?.dataset.trackId;
        if (!trackId) return;
        try {
          await httpRequest.delete(`/api/tracks/${trackId}/like`, { auth: true });
          row?.remove();
          window.dispatchEvent(new Event("library:refresh"));
        } catch (error) {
          showToast(error.message || "Không thể cập nhật. Vui lòng thử lại.");
        }
      });
    });
  } catch (error) {
    detailView.innerHTML = `
      <button class="detail-back pill-button pill-button--ghost px-3 py-2 text-sm mb-4" data-detail-back>
        <i class="ph-fill ph-arrow-left text-[16px] leading-none" aria-hidden="true"></i>
        <span>Quay lại</span>
      </button>
      <p class="text-subdued">Không thể tải danh sách. ${escapeHtml(error.message || "")}</p>
    `;
    detailView.querySelector("[data-detail-back]")?.addEventListener("click", () => history.back());
  }
}

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

export function initSearch() {
  if (!form || !input || !suggestionsEl || !resultsEl) return;

  // form submit (click icon or Enter)
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) {
      hideAllDropdowns();
      return;
    }
    clearTimeout(debounceTimer);
    fetchSearch(q);
    input.focus();
  });

  // focus -> trending if empty, else show results if has value
  input.addEventListener("focus", () => {
    const q = input.value.trim();
    if (!q) {
      fetchTrending();
    } else {
      if (resultsEl.childElementCount) {
        show(resultsEl);
        hide(suggestionsEl);
      } else {
        fetchSearch(q);
      }
    }
  });

  // input -> debounce search, hide suggestions
  input.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    if (!q) {
      hide(resultsEl);
      fetchTrending();
      return;
    }
    hide(suggestionsEl);
    debouncedSearch(q);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      hideAllDropdowns();
      input.blur();
    }
  });

  browseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    input.focus();
  });

  // click outside to hide
  document.addEventListener("click", (e) => {
    if (!center?.contains(e.target)) {
      hideAllDropdowns();
    }
  });

  // home link resets
  homeLink?.addEventListener("click", (e) => {
    // let default navigation happen but also reset view if SPA
    hideAllDropdowns();
    input.value = "";
    showHome();
  });

  // popstate for detail back
  window.addEventListener("popstate", () => {
    const path = location.pathname;
    if (path === "/liked") {
      renderLikedSongs();
      return;
    }
    const match = path.match(/^\/(playlist|artist|album|track)\/([^/]+)/);
    if (match) {
      const [, type, id] = match;
      renderDetail(type, id);
    } else if (path === "/" || path === "/index.html") {
      showHome();
      hideAllDropdowns();
    }
  });

  // if direct load with /playlist/:id etc, show detail
  if (location.pathname === "/liked") {
    renderLikedSongs();
  } else {
    const initialMatch = location.pathname.match(/^\/(playlist|artist|album|track)\/([^/]+)/);
    if (initialMatch) {
      const [, type, id] = initialMatch;
      renderDetail(type, id);
    }
  }
}
