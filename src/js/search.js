import { httpRequest, HttpError } from "../services/http.js";
import { getSession, isLoggedIn } from "../services/auth.js";
import { enablePlaylistEditing } from "./playlist.js";
import { setQueue, normalizeTrack } from "./player.js";
import {
  createTrackCard,
  createArtistCard,
  createAlbumCard,
  createPlaylistCard,
} from "./renderCards.js";
import { initCarousels } from "./carouselBtn.js";

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
let currentDetailInfo = null;

const SECTION_MAP = {
  "0JQ5DB5E8N831KzFzsBBQ2": {
    title: "Bài hát thịnh hành",
    endpoint: "/api/tracks/popular?limit=50&offset=0",
    type: "track",
    getItems: (d) => d.tracks || [],
    createCard: createTrackCard,
  },
  "0JQ5DAnM3wGh0gz1MXnu3C": {
    title: "Nghệ sĩ nổi bật",
    endpoint: "/api/artists/trending?limit=50",
    type: "artist",
    getItems: (d) => d.artists || [],
    createCard: createArtistCard,
  },
  "0JQ5DAnM3wGh0gz1MXnu3B": {
    title: "Album và đĩa đơn nổi bật",
    endpoint: "/api/albums/popular?limit=50",
    type: "album",
    getItems: (d) => d.albums || [],
    createCard: createAlbumCard,
  },
  "0JQ5DAnM3wGh0gz1MXnu4h": {
    title: "Tất cả playlist",
    endpoint: "/api/playlists?limit=50&offset=0&",
    type: "playlist",
    getItems: (d) => d.playlists || [],
    createCard: createPlaylistCard,
  },
};

// Global like sync: when player or detail changes like, update the other UI
window.addEventListener("like:changed", (e) => {
  const { id, type, is_liked } = e.detail || {};
  if (!id) return;
  // Hero heart in detail view (track/album)
  if (currentDetailInfo && String(currentDetailInfo.id) === String(id) && String(currentDetailInfo.type) === String(type)) {
    const heroHeart = detailView.querySelector("[data-detail-follow].detail-heart-btn");
    if (heroHeart) {
      heroHeart.classList.toggle("is-active", !!is_liked);
      heroHeart.setAttribute("aria-pressed", String(!!is_liked));
      const lab = is_liked ? "Xóa khỏi Bài hát đã thích" : "Lưu vào Bài hát đã thích";
      heroHeart.setAttribute("aria-label", lab);
      heroHeart.dataset.tooltip = lab;
      heroHeart.dataset.isLiked = String(!!is_liked);
    }
  }
  // Liked playlist rows
  detailView.querySelectorAll(`.detail-track[data-track-id="${CSS.escape(String(id))}"] .detail-heart-btn`).forEach((btn) => {
    btn.classList.toggle("is-active", !!is_liked);
    btn.setAttribute("aria-pressed", String(!!is_liked));
    const lab = is_liked ? "Xóa khỏi Bài hát đã thích" : "Lưu vào Bài hát đã thích";
    btn.setAttribute("aria-label", lab);
    btn.dataset.tooltip = lab;
  });
  // Also update any track cards? Not needed
});

function stripAccent(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

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

export function showHome() {
  if (homeContent) homeContent.hidden = false;
  if (homeContent) homeContent.classList.remove("hidden");
  if (detailView) {
    detailView.hidden = true;
    detailView.classList.add("hidden");
    detailView.innerHTML = "";
  }
  currentDetailInfo = null;
  if (location.pathname !== "/" && location.pathname !== "/index.html") {
    history.pushState(null, "", "/");
  }
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

async function fetchAccentFallback(qNorm) {
  try {
    const [artistsData, tracksData, albumsData, playlistsData] = await Promise.all([
      httpRequest.get("/api/artists/trending?limit=20"),
      httpRequest.get("/api/tracks/popular?limit=20"),
      httpRequest.get("/api/albums/popular?limit=20"),
      httpRequest.get("/api/playlists?limit=20&offset=0&"),
    ]);
    const out = [];
    for (const a of artistsData.artists || []) {
      if (stripAccent(a.name).includes(qNorm) || stripAccent(a.bio || "").includes(qNorm)) {
        out.push({ id: a.id, title: a.name, subtitle: "Artist", image_url: a.image_url, type: "artist" });
      }
    }
    for (const t of tracksData.tracks || []) {
      if (stripAccent(t.title).includes(qNorm) || stripAccent(t.artist_name || "").includes(qNorm)) {
        out.push({ id: t.id, title: t.title, subtitle: t.artist_name, image_url: t.image_url, type: "track" });
      }
    }
    for (const al of albumsData.albums || []) {
      if (stripAccent(al.title).includes(qNorm) || stripAccent(al.artist_name || "").includes(qNorm)) {
        out.push({ id: al.id, title: al.title, subtitle: al.artist_name, image_url: al.cover_image_url, type: "album" });
      }
    }
    for (const pl of playlistsData.playlists || []) {
      if (stripAccent(pl.name).includes(qNorm) || stripAccent(pl.description || "").includes(qNorm)) {
        out.push({ id: pl.id, title: pl.name, subtitle: pl.description || "Playlist", image_url: pl.image_url, type: "playlist" });
      }
    }
    return out.slice(0, 20);
  } catch {
    return [];
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
    let items = extractSearchItems(data);
    // accent-insensitive fallback when BE returns 0 (BE is accent-sensitive, case-insensitive only with accent)
    if (!items.length) {
      const qNorm = stripAccent(q);
      if (qNorm) {
        const fallback = await fetchAccentFallback(qNorm);
        if (fallback.length) items = fallback;
      }
    }
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

export function navigateToSection(id) {
  hideAllDropdowns();
  if (input) input.blur();
  history.pushState({ type: "section", id }, "", `/section/${id}`);
  renderSection(id);
}

export async function renderSection(id) {
  const cfg = SECTION_MAP[id];
  showDetail();
  currentDetailInfo = { id, type: "section" };
  if (!cfg) {
    detailView.innerHTML = `<p class="text-subdued mt-8 px-8">Không tìm thấy danh mục.</p>`;
    return;
  }
  detailView.innerHTML = `
    <section class="section-detail">
      <header class="section-detail__header">
        <h1 class="section-detail__title">${escapeHtml(cfg.title)}</h1>
      </header>
      <ul class="section-detail__grid" aria-label="${escapeHtml(cfg.title)}" aria-busy="true">
        ${Array.from({ length: 12 }).map(() => `<li class="media-card" aria-hidden="true"><div class="media-card__cover skeleton"></div><div class="media-card__body"><div class="skeleton skeleton--title"></div><div class="skeleton skeleton--subtitle"></div></div></li>`).join("")}
      </ul>
    </section>`;
  try {
    const data = await httpRequest.get(cfg.endpoint);
    const items = cfg.getItems(data) || [];
    const grid = detailView.querySelector(".section-detail__grid");
    if (!grid) return;
    grid.innerHTML = "";
    grid.removeAttribute("aria-busy");
    if (!items.length) {
      grid.innerHTML = `<li class="text-subdued p-4">Không có dữ liệu.</li>`;
      return;
    }
    for (const item of items) {
      const card = cfg.createCard(item);
      grid.appendChild(card);
    }
  } catch (e) {
    const grid = detailView.querySelector(".section-detail__grid");
    if (grid) {
      grid.removeAttribute("aria-busy");
      grid.innerHTML = `<li class="text-subdued p-4">Không thể tải dữ liệu. ${escapeHtml(e.message || "")}</li>`;
    }
  }
}

async function renderDetail(type, id, fallbackTitle) {
  showDetail();
  currentDetailInfo = { id, type };
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
    const FALLBACK = "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg";
    const coverUrl = cover || FALLBACK;

    const isFollow = type === "artist" || type === "playlist";
    const isLike = type === "album" || type === "track";
    const sessionUser = getSession()?.user;
    const isOwner =
      type === "playlist" &&
      !!entity.user_id &&
      !!sessionUser?.id &&
      String(entity.user_id) === String(sessionUser.id);
    const followable = !isOwner && (isFollow || isLike);
    let following = !!(isFollow ? entity.is_following : entity.is_liked);

    const followBtn = followable
      ? isFollow
        ? `<button class="pill-button ${following ? "pill-button--ghost" : "pill-button--white"} px-5 py-2 text-sm" type="button" data-detail-follow aria-pressed="${following}">${following ? "Đang theo dõi" : "Theo dõi"}</button>`
        : `<button class="detail-heart-btn${following ? " is-active" : ""}" type="button" data-detail-follow aria-label="${following ? "Xóa khỏi Bài hát đã thích" : "Lưu vào Bài hát đã thích"}" aria-pressed="${following}"><i class="ph-fill ph-heart text-[24px] leading-none" aria-hidden="true"></i></button>`
      : "";

    const actionsHtml = isOwner
      ? `<div class="detail-hero__actions">
           <button class="detail-play-btn" type="button" aria-label="Phát"><i class="ph-fill ph-play text-[24px] leading-none" aria-hidden="true"></i></button>
           <button class="detail-action-icon" type="button" data-playlist-edit aria-label="Chỉnh sửa playlist">
             <i class="ph-fill ph-pencil text-[16px] leading-none" aria-hidden="true"></i>
           </button>
           <button class="detail-action-icon detail-action-icon--danger" type="button" data-playlist-delete aria-label="Xóa playlist">
             <i class="ph-fill ph-trash text-[16px] leading-none" aria-hidden="true"></i>
           </button>
           <button class="pill-button ${entity.is_public ? "pill-button--ghost" : "pill-button--white"} px-5 py-2 text-sm" type="button" data-playlist-visibility data-is-public="${!!entity.is_public}">${entity.is_public ? "Đặt riêng tư" : "Đặt công khai"}</button>
         </div>`
      : `<div class="detail-hero__actions">
           <button class="detail-play-btn" type="button" aria-label="Phát"><i class="ph-fill ph-play text-[24px] leading-none" aria-hidden="true"></i></button>
           ${followBtn}
         </div>`;

    const totalMin = tracks.length ? Math.floor(tracks.reduce((s, t) => s + (t.duration || 0), 0) / 60) : 0;
    const countMeta = tracks.length ? `${tracks.length} ${tracks.length === 1 ? "bài hát" : "bài hát"}${totalMin ? `, ${totalMin} phút` : ""}` : "";
    const followersMeta = entity.followers_count ? `${Number(entity.followers_count).toLocaleString("vi-VN")} lượt lưu` : "";
    const metaHtml = [
      entity.user_display_name ? `Bởi ${escapeHtml(entity.user_display_name)}` : "",
      entity.monthly_listeners ? `${Number(entity.monthly_listeners).toLocaleString("vi-VN")} người nghe hàng tháng` : "",
      followersMeta ? escapeHtml(followersMeta) : "",
      countMeta ? escapeHtml(countMeta) : "",
      subtitle ? escapeHtml(subtitle) : "",
    ].filter(Boolean).join(" · ");

    const typeLabels = { playlist: "Playlist", artist: "Nghệ sĩ", album: "Album", track: "Bài hát" };

    const isRound = type === "artist";
    const coverClasses = `detail-hero__cover${isRound ? " detail-hero__cover--round" : ""}${isOwner ? " detail-cover--editable" : ""}`;

    let trackTableHtml = "";
    if (tracks.length > 0) {
      const showAlbumCol = type !== "album";
      const albumHeader = showAlbumCol ? `<span class="detail-tracks__album">Album</span>` : "";
      const trackRows = tracks.map((t, i) => {
        const thumb = t.album_cover_image_url || t.image_url || coverUrl;
        const albumCell = showAlbumCol ? `<span class="detail-tracks__album">${escapeHtml(t.album_title || "")}</span>` : "";
        return `<li class="detail-track" data-track-index="${i}">
          <span class="detail-track__number">${i + 1}</span>
          <button class="detail-track__play-btn" type="button" aria-label="Phát ${escapeHtml(t.title || "")}"><i class="ph-fill ph-play text-[14px] leading-none" aria-hidden="true"></i></button>
          <img class="detail-track__thumb" src="${escapeHtml(thumb)}" alt="" width="40" height="40" loading="lazy" />
          <div class="detail-track__info">
            <span class="detail-track__title">${escapeHtml(t.title || t.name || "Bài hát")}</span>
            <span class="detail-track__artist">${escapeHtml(t.artist_name || "")}</span>
          </div>
          ${albumCell}
          <span class="detail-tracks__duration">${t.duration ? formatDuration(t.duration) : ""}</span>
        </li>`;
      }).join("");

      trackTableHtml = `
        <div class="detail-tracks">
          <div class="detail-tracks__header">
            <span class="detail-tracks__num-col">#</span>
            <span class="detail-tracks__title-col">Tiêu đề</span>
            ${albumHeader}
            <span class="detail-tracks__duration-col"><i class="ph-fill ph-clock text-[14px] leading-none" aria-hidden="true"></i></span>
          </div>
          <ol class="detail-tracks__list">${trackRows}</ol>
        </div>`;
    }

    const showEmpty = type !== "track";
    const emptyHtml = showEmpty ? `<p class="detail-empty" style="padding:24px 24px;color:var(--color-subdued);">Chưa có bài hát nào</p>` : "";
    detailView.innerHTML = `
      <section class="detail-hero" style="--cover:url('${coverUrl}')">
        <div class="detail-hero__bg"></div>
        <div class="detail-hero__gradient"></div>
        <div class="detail-hero__content">
          <img
            class="${coverClasses}"
            src="${coverUrl}"
            alt=""
            ${isOwner ? 'data-playlist-cover' : ""}
          />
          <div class="detail-hero__info">
            <p class="detail-hero__type">${escapeHtml(typeLabels[type] || type)}</p>
            <h1 class="detail-hero__title${isOwner ? " detail-title--editable" : ""}" ${isOwner ? 'data-playlist-edit' : ""}>${escapeHtml(title)}</h1>
            ${metaHtml ? `<p class="detail-hero__meta">${metaHtml}</p>` : ""}
            ${actionsHtml}
          </div>
        </div>
      </section>
      ${trackTableHtml || emptyHtml}
      <div id="detail-extra"></div>
    `;

    // Extra carousel to fill empty space (Spotify-like)
    (async () => {
      const extraEl = detailView.querySelector("#detail-extra");
      if (!extraEl) return;
      try {
        let extraTitle = "";
        let extraItems = [];
        let createCard = null;
        if (type === "artist" && entity.id) {
          extraTitle = "Đĩa nhạc";
          try {
            const d = await httpRequest.get(`/api/artists/${id}/tracks/popular`);
            extraItems = d.tracks || d.data || [];
            createCard = createTrackCard;
            if (!extraItems.length) {
              const a = await httpRequest.get("/api/artists/trending?limit=12");
              extraItems = a.artists || [];
              createCard = createArtistCard;
              extraTitle = "Nghệ sĩ liên quan";
            }
          } catch {
            const a = await httpRequest.get("/api/artists/trending?limit=12");
            extraItems = (a.artists || []).slice(0, 12);
            createCard = createArtistCard;
            extraTitle = "Nghệ sĩ liên quan";
          }
        } else if (type === "album" && entity.artist_id) {
          extraTitle = `Thêm từ ${escapeHtml(entity.artist_name || "nghệ sĩ này")}`;
          try {
            const a = await httpRequest.get(`/api/artists/${entity.artist_id}/albums?limit=12`);
            extraItems = a.albums || a.data || [];
            createCard = createAlbumCard;
            if (!extraItems.length) throw new Error("empty");
          } catch {
            const d = await httpRequest.get("/api/albums/popular?limit=12");
            extraItems = d.albums || [];
            createCard = createAlbumCard;
            extraTitle = "Album nổi bật";
          }
        } else if (type === "track" && entity.artist_id) {
          extraTitle = `Thêm từ ${escapeHtml(entity.artist_name || "nghệ sĩ này")}`;
          try {
            const d = await httpRequest.get(`/api/artists/${entity.artist_id}/tracks/popular`);
            extraItems = (d.tracks || []).filter((t) => String(t.id) !== String(id)).slice(0, 12);
            createCard = createTrackCard;
            if (!extraItems.length) throw new Error("empty");
          } catch {
            const d = await httpRequest.get("/api/tracks/popular?limit=12");
            extraItems = (d.tracks || []).filter((t) => String(t.id) !== String(id)).slice(0, 12);
            createCard = createTrackCard;
            extraTitle = "Bài hát gợi ý";
          }
        } else {
          extraTitle = "Bài hát gợi ý";
          const d = await httpRequest.get("/api/tracks/popular?limit=12");
          extraItems = d.tracks || [];
          createCard = createTrackCard;
        }
        if (!extraItems.length || !createCard) return;
        const section = document.createElement("section");
        section.className = "detail-extra section-group";
        section.innerHTML = `
          <header class="section-group__header">
            <h2 class="section-group__title">${extraTitle}</h2>
          </header>
          <div class="card-carousel">
            <button class="carousel-nav carousel-nav--prev" type="button" aria-label="Trước" disabled><i class="ph-fill ph-caret-left text-[16px]"></i></button>
            <ul class="card-grid"></ul>
            <button class="carousel-nav carousel-nav--next" type="button" aria-label="Tiếp theo"><i class="ph-fill ph-caret-right text-[16px]"></i></button>
          </div>`;
        const grid = section.querySelector(".card-grid");
        extraItems.slice(0, 12).forEach((it) => grid.appendChild(createCard(it)));
        extraEl.appendChild(section);
        initCarousels();
      } catch {}
    })();

    if (isOwner) {
      enablePlaylistEditing({ id, entity });
    }

    // ---- Player wiring: hero play + track rows + highlight ----
    const detailTracks = tracks;
    const detailType = type;
    const detailId = id;
    const buildQueue = () => {
      if (detailType === "track") {
        const single = normalizeTrack({ ...entity, id: detailId, title, image_url: coverUrl });
        return [single];
      }
      return detailTracks.map((t) => normalizeTrack(t));
    };

    const heroPlayBtn = detailView.querySelector(".detail-play-btn");
    if (heroPlayBtn) {
      const hasQueue = detailType === "track" || detailTracks.length > 0;
      if (!hasQueue) heroPlayBtn.setAttribute("disabled", "");
      heroPlayBtn.addEventListener("click", () => {
        const q = buildQueue();
        if (!q.length) {
          showToast("Không có bài hát để phát.");
          return;
        }
        setQueue(q, 0, { type: detailType, id: detailId });
      });
    }

    const rowPlayBtns = detailView.querySelectorAll(".detail-track__play-btn");
    rowPlayBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        const q = buildQueue();
        if (!q.length) return;
        const start = detailType === "track" ? 0 : idx;
        setQueue(q, start, { type: detailType, id: detailId });
      });
    });

    // Highlight current playing track
    const highlightPlaying = (track) => {
      detailView.querySelectorAll(".detail-track").forEach((row) => row.classList.remove("is-playing"));
      if (!track?.id) return;
      const idx = buildQueue().findIndex((t) => String(t.id) === String(track.id));
      if (idx >= 0) {
        const row = detailView.querySelector(`[data-track-index="${idx}"]`);
        if (row) row.classList.add("is-playing");
      }
    };
    const trackChangeHandler = (e) => highlightPlaying(e.detail?.track);
    window.addEventListener("player:trackchange", trackChangeHandler);
    // initial highlight if already playing
    try {
      const cur = window.__player?.getState?.()?.track;
      if (cur) highlightPlaying(cur);
    } catch {}

    const followEl = detailView.querySelector("[data-detail-follow]");
    if (followable && followEl) {
      followEl.dataset.isLiked = String(following);
      const detailFollowId = id;
      const detailFollowType = type;
      const updateFollowBtn = () => {
        const isActive = followEl.dataset.isLiked === "true";
        if (isFollow) {
          followEl.className = `pill-button ${isActive ? "pill-button--ghost" : "pill-button--white"} px-5 py-2 text-sm`;
          followEl.textContent = isActive ? "Đang theo dõi" : "Theo dõi";
          followEl.setAttribute("aria-pressed", String(isActive));
          followEl.dataset.tooltip = isActive ? "Đang theo dõi" : "Theo dõi";
        } else {
          followEl.classList.toggle("is-active", isActive);
          followEl.setAttribute("aria-pressed", String(isActive));
          const lab = isActive ? "Xóa khỏi Bài hát đã thích" : "Lưu vào Bài hát đã thích";
          followEl.setAttribute("aria-label", lab);
          followEl.dataset.tooltip = lab;
        }
      };

      followEl.addEventListener("click", async () => {
        if (followEl.disabled) return;
        followEl.disabled = true;
        const isCurrentlyLiked = followEl.dataset.isLiked === "true";
        const url = isFollow
          ? `/api/${type}s/${id}/follow`
          : `/api/${type}s/${id}/like`;
        try {
          if (isCurrentlyLiked) {
            await httpRequest.delete(url, { auth: true });
          } else {
            await httpRequest.post(url, {}, { auth: true });
          }
          const newState = !isCurrentlyLiked;
          following = newState;
          followEl.dataset.isLiked = String(newState);
          updateFollowBtn();
          window.dispatchEvent(new Event("library:refresh"));
          window.dispatchEvent(new CustomEvent("like:changed", { detail: { id, type, is_liked: newState } }));
          if (isFollow) {
            showToast(newState ? "Đã theo dõi." : "Đã bỏ theo dõi.");
          } else {
            if (type === "track") {
              showToast(newState ? "Đã thêm vào Bài hát đã thích." : "Đã xóa khỏi Bài hát đã thích.");
            } else {
              showToast(newState ? "Đã thêm vào Thư viện." : "Đã xóa khỏi Thư viện.");
            }
          }
        } catch (error) {
          showToast(error.message || "Không thể cập nhật. Vui lòng thử lại.");
        } finally {
          followEl.disabled = false;
        }
      });
    }
  } catch (e) {
    detailView.innerHTML = `
      <p class="text-subdued mt-8 px-8">Không thể tải chi tiết. ${escapeHtml(e.message || "")}</p>
    `;
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

function formatDateAdded(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "vài giây trước";
  if (sec < 3600) return `${Math.floor(sec / 60)} phút trước`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} giờ trước`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} ngày trước`;
  if (sec < 2592000) {
    const weeks = Math.floor(sec / 604800);
    return weeks === 1 ? "1 tuần trước" : `${weeks} tuần trước`;
  }
  if (sec < 31536000) {
    return d.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTooltip(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" });
}

async function renderLikedSongs() {
  showDetail();
  currentDetailInfo = { id: "liked", type: "liked" };
  detailView.innerHTML = `<div class="detail-loading"><p class="text-white">Đang tải...</p></div>`;

  try {
    const data = await httpRequest.get("/api/me/tracks/liked?limit=50", { auth: true });
    const tracks = data.tracks || [];
    const countText = `${tracks.length} bài hát`;

    const sessionUser = getSession()?.user;
    const userDisplay = sessionUser ? escapeHtml(sessionUser.display_name || sessionUser.username || "") : "";
    const heroMeta = userDisplay ? `${userDisplay} · ${countText}` : countText;
    const heroAvatar = sessionUser?.avatar_url ? `<img src="${escapeHtml(sessionUser.avatar_url)}" alt="" class="detail-hero__avatar" />` : "";

    const trackRows = tracks.map((t, i) => {
      const thumb = t.image_url || t.album_cover_image_url || "";
      const album = t.album_title || t.album || "";
      const dateAdded = t.saved_at ? formatDateAdded(t.saved_at) : "";
      const dateTooltip = t.saved_at ? formatDateTooltip(t.saved_at) : "";
      return `<li class="detail-track detail-track--liked" data-track-id="${escapeHtml(t.id)}">
        <span class="detail-track__number">${i + 1}</span>
        <button class="detail-track__play-btn" type="button" aria-label="Phát ${escapeHtml(t.title || "")}"><i class="ph-fill ph-play text-[14px] leading-none" aria-hidden="true"></i></button>
        <div class="detail-track__title-cell">
          ${thumb ? `<img class="detail-track__thumb" src="${escapeHtml(thumb)}" alt="" width="40" height="40" loading="lazy" />` : `<div class="detail-track__thumb detail-track__thumb--fallback" aria-hidden="true"><i class="ph-fill ph-music-notes text-[16px]"></i></div>`}
          <div class="detail-track__info">
            <span class="detail-track__title">${escapeHtml(t.title || "Bài hát")}</span>
            <span class="detail-track__artist">${escapeHtml(t.artist_name || "")}</span>
          </div>
        </div>
        <span class="detail-tracks__album" title="${escapeHtml(album)}">${escapeHtml(album)}</span>
        <span class="detail-tracks__date" title="${escapeHtml(dateTooltip)}">${escapeHtml(dateAdded)}</span>
        <div class="detail-track__duration-cell">
          <button class="detail-heart-btn is-active" type="button" data-liked-unlike aria-label="Xóa khỏi Bài hát đã thích" aria-pressed="true">
            <i class="ph-fill ph-heart text-[16px] leading-none" aria-hidden="true"></i>
          </button>
          <span class="detail-tracks__duration">${t.duration ? formatDuration(t.duration) : ""}</span>
        </div>
      </li>`;
    }).join("");

    detailView.innerHTML = `
      <section class="detail-hero detail-hero--liked">
        <div class="detail-hero__gradient"></div>
        <div class="detail-hero__content">
          <div class="detail-hero__cover detail-hero__cover--liked" aria-hidden="true">
            <i class="ph-fill ph-heart text-[56px] leading-none"></i>
          </div>
          <div class="detail-hero__info">
            <p class="detail-hero__type">Playlist</p>
            <h1 class="detail-hero__title">Bài hát đã thích</h1>
            <p class="detail-hero__meta">${heroAvatar}${heroMeta}</p>
          </div>
        </div>
      </section>
      ${tracks.length ? `
      <div class="detail-action-bar detail-action-bar--liked">
        <button class="detail-play-btn" type="button" aria-label="Phát Bài hát đã thích"><i class="ph-fill ph-play text-[24px] leading-none" aria-hidden="true"></i></button>
        <span class="detail-action-bar__count">${countText}</span>
      </div>` : ""}
      ${tracks.length ? `
      <div class="detail-tracks detail-tracks--liked">
        <div class="detail-tracks__header detail-tracks__header--liked">
          <span class="detail-tracks__num-col">#</span>
          <span class="detail-tracks__title-col">Tiêu đề</span>
          <span class="detail-tracks__album">Album</span>
          <span class="detail-tracks__date-col">Ngày thêm</span>
          <span class="detail-tracks__duration-col"><i class="ph-fill ph-clock text-[14px] leading-none" aria-hidden="true"></i></span>
        </div>
        <ol class="detail-tracks__list">${trackRows}</ol>
      </div>` : `<div class="detail-empty"><i class="ph-fill ph-heart text-[48px] leading-none text-subdued mb-4"></i><p class="text-white font-bold">Chưa có bài hát đã thích</p><p class="text-subdued text-sm mt-2">Các bài hát bạn thích sẽ hiển thị tại đây</p></div>`}
    `;

    // Player wiring for Liked Songs
    const likedQueue = tracks.map((t) => normalizeTrack(t));
    const likedHeroBtn = detailView.querySelector(".detail-play-btn");
    if (likedHeroBtn) {
      if (!likedQueue.length) likedHeroBtn.setAttribute("disabled", "");
      likedHeroBtn.addEventListener("click", () => {
        if (!likedQueue.length) return;
        setQueue(likedQueue, 0, { type: "liked", id: "liked" });
      });
    }
    const likedRowBtns = detailView.querySelectorAll(".detail-track__play-btn");
    likedRowBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.closest("[data-track-id]");
        const tid = r?.dataset.trackId;
        const idx = tid ? likedQueue.findIndex((t) => String(t.id) === String(tid)) : -1;
        if (idx >= 0) setQueue(likedQueue, idx, { type: "liked", id: "liked" });
        else if (likedQueue.length) setQueue(likedQueue, 0, { type: "liked", id: "liked" });
      });
    });
    const likedHighlight = (track) => {
      detailView.querySelectorAll(".detail-track").forEach((row) => row.classList.remove("is-playing"));
      if (!track?.id) return;
      const row = detailView.querySelector(`.detail-track[data-track-id="${CSS.escape(String(track.id))}"]`);
      if (row) row.classList.add("is-playing");
    };
    window.addEventListener("player:trackchange", (e) => likedHighlight(e.detail?.track));
    try {
      const cur = window.__player?.getState?.()?.track;
      if (cur) likedHighlight(cur);
    } catch {}

    detailView.querySelectorAll("[data-liked-unlike]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("[data-track-id]");
        const trackId = row?.dataset.trackId;
        if (!trackId || btn.disabled) return;
        btn.disabled = true;
        try {
          await httpRequest.delete(`/api/tracks/${trackId}/like`, { auth: true });
          const qIdx = likedQueue.findIndex((t) => String(t.id) === String(trackId));
          if (qIdx >= 0) likedQueue.splice(qIdx, 1);
          row.remove();
          window.dispatchEvent(new CustomEvent("like:changed", { detail: { id: trackId, type: "track", is_liked: false } }));
          detailView.querySelectorAll(".detail-track--liked").forEach((r, i) => {
            const num = r.querySelector(".detail-track__number");
            if (num) num.textContent = String(i + 1);
          });
          const remaining = likedQueue.length;
          const heroMetaEl = detailView.querySelector(".detail-hero__meta");
          const actionCountEl = detailView.querySelector(".detail-action-bar__count");
          const rawDisplay = sessionUser ? (sessionUser.display_name || sessionUser.username || "") : "";
          const metaText = rawDisplay
            ? `${rawDisplay} · ${remaining} bài hát`
            : `${remaining} bài hát`;
          if (heroMetaEl) {
            const avatarHtml2 = sessionUser?.avatar_url
              ? `<img src="${escapeHtml(sessionUser.avatar_url)}" alt="" class="detail-hero__avatar" />`
              : "";
            heroMetaEl.innerHTML = `${avatarHtml2}${escapeHtml(metaText)}`;
          }
          if (remaining === 0) {
            detailView.querySelector(".detail-action-bar--liked")?.remove();
            detailView.querySelector(".detail-tracks--liked")?.remove();
            if (!detailView.querySelector(".detail-empty")) {
              const empty = document.createElement("div");
              empty.className = "detail-empty";
              empty.innerHTML = `<i class="ph-fill ph-heart text-[48px] leading-none text-subdued mb-4" aria-hidden="true"></i><p class="text-white font-bold">Chưa có bài hát đã thích</p><p class="text-subdued text-sm mt-2">Các bài hát bạn thích sẽ hiển thị tại đây</p>`;
              const extra = detailView.querySelector(".detail-extra");
              if (extra) extra.before(empty);
              else detailView.appendChild(empty);
            }
          } else if (actionCountEl) {
            actionCountEl.textContent = `${remaining} bài hát`;
          }
          window.dispatchEvent(new Event("library:refresh"));
          showToast("Đã xóa khỏi Bài hát đã thích.");
        } catch (error) {
          btn.disabled = false;
          showToast(error.message || "Không thể cập nhật. Vui lòng thử lại.");
        }
      });
    });

    // Extra Recommended to fill emptiness (Spotify-like)
    (async () => {
      try {
        const d = await httpRequest.get("/api/tracks/popular?limit=12");
        let items = (d.tracks || []).filter((t) => !tracks.some((l) => String(l.id) === String(t.id))).slice(0, 12);
        if (!items.length) return;
        const section = document.createElement("section");
        section.className = "detail-extra section-group";
        section.innerHTML = `
          <header class="section-group__header">
            <h2 class="section-group__title">Bài hát gợi ý</h2>
          </header>
          <div class="card-carousel">
            <button class="carousel-nav carousel-nav--prev" type="button" aria-label="Trước" disabled><i class="ph-fill ph-caret-left text-[16px]"></i></button>
            <ul class="card-grid"></ul>
            <button class="carousel-nav carousel-nav--next" type="button" aria-label="Tiếp theo"><i class="ph-fill ph-caret-right text-[16px]"></i></button>
          </div>`;
        const grid = section.querySelector(".card-grid");
        items.forEach((it) => grid.appendChild(createTrackCard(it)));
        detailView.appendChild(section);
        initCarousels();
      } catch {}
    })();
  } catch (error) {
    detailView.innerHTML = `
      <p class="text-subdued mt-8 px-8">Không thể tải danh sách. ${escapeHtml(error.message || "")}</p>
    `;
  }
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

export async function renderProfile() {
  if (!isLoggedIn()) {
    location.href = "/login.html?message=Vui%20l%C3%B2ng%20%C4%91%C4%83ng%20nh%E1%BA%ADp.";
    return;
  }
  showDetail();
  detailView.innerHTML = `<div class="detail-loading p-8"><p class="text-white">Đang tải hồ sơ...</p></div>`;
  try {
    const data = await httpRequest.get("/api/users/me", { auth: true });
    const user = data.user;
    const stats = data.stats || {};
    const name = user.display_name || user.username || user.email || "";
    const initial = (name.charAt(0) || "?").toUpperCase();
    const avatarHtml = user.avatar_url
      ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(name)}" class="h-full w-full object-cover" />`
      : `<span>${escapeHtml(initial)}</span>`;
    detailView.innerHTML = `
      <section class="profile-page__main" style="display:flex; justify-content:center; align-items:flex-start; padding:32px 24px;">
        <div class="profile-card" aria-labelledby="profile-name">
          <div class="profile-card__avatar">
            ${avatarHtml}
          </div>
          <h1 id="profile-name" class="profile-card__name">${escapeHtml(name)}</h1>
          <p class="profile-card__username">${user.username ? `@${escapeHtml(user.username)}` : ""}</p>
          <p class="profile-card__joined">${user.created_at ? `Đã tham gia ${escapeHtml(formatJoined(user.created_at))}` : ""}</p>
          <p class="profile-card__email">${escapeHtml(user.email || "")}</p>
          <dl class="profile-card__stats">
            <div class="profile-stat">
              <dt class="profile-stat__value">${escapeHtml(String(stats.playlists ?? 0))}</dt>
              <dd class="profile-stat__label">Playlists</dd>
            </div>
            <div class="profile-stat">
              <dt class="profile-stat__value">${escapeHtml(String(stats.following ?? 0))}</dt>
              <dd class="profile-stat__label">Đang theo dõi</dd>
            </div>
            <div class="profile-stat">
              <dt class="profile-stat__value">${escapeHtml(String(stats.plays ?? 0))}</dt>
              <dd class="profile-stat__label">Lượt nghe</dd>
            </div>
          </dl>
        </div>
      </section>
    `;
  } catch (error) {
    const msg = error instanceof HttpError ? error.message : "Không thể tải hồ sơ. Vui lòng thử lại.";
    detailView.innerHTML = `<p class="text-subdued mt-8 px-8">${escapeHtml(msg)}</p>`;
  }
}

export function navigateToProfile() {
  hideAllDropdowns();
  if (input) input.blur();
  history.pushState({ type: "profile" }, "", "/profile");
  renderProfile();
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

  // home link resets — SPA without reload (keep Audio), like Spotify
  const logoLink = document.querySelector(".top-bar__logo");
  const handleHomeNav = (e) => {
    e.preventDefault();
    hideAllDropdowns();
    input.value = "";
    const isHome = location.pathname === "/" || location.pathname === "/index.html";
    const isDetailVisible = detailView && !detailView.hidden;
    if (isHome && !isDetailVisible) {
      // already at home: just scroll to top, no pushState/re-render
      document.querySelector(".app-main")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    showHome();
    document.querySelector(".app-main")?.scrollTo({ top: 0 });
  };
  homeLink?.addEventListener("click", handleHomeNav);
  logoLink?.addEventListener("click", handleHomeNav);

  // SPA profile link — intercept without full reload to keep audio playing
  document.addEventListener("click", (e) => {
    if (e.target.closest('a[href*="login.html"], a[href*="signup.html"]')) return;
    const profileLink = e.target.closest('a[data-profile-link], a[href="/profile"], a[href="profile.html"]');
    if (profileLink) {
      // only intercept when we're on index.html SPA (detailView exists)
      if (detailView && homeContent) {
        e.preventDefault();
        navigateToProfile();
        // close user menu if open
        const menu = document.querySelector("[data-user-menu]");
        const toggle = document.querySelector("[data-avatar-toggle]");
        if (menu && !menu.hasAttribute("hidden")) {
          menu.setAttribute("hidden", "");
          toggle?.setAttribute("aria-expanded", "false");
        }
      }
    }
  });

  // SPA section links — Show all (like Spotify, keep Audio)
  document.addEventListener("click", (e) => {
    const sectionLink = e.target.closest('a[href^="/section/"]');
    if (!sectionLink) return;
    if (detailView && homeContent) {
      e.preventDefault();
      const id = sectionLink.getAttribute("href").split("/section/")[1]?.split("?")[0]?.split("#")[0];
      if (id) navigateToSection(id);
    }
  });

  // popstate for detail back
  window.addEventListener("popstate", () => {
    const path = location.pathname;
    if (path === "/profile") {
      renderProfile();
      return;
    }
    if (path === "/liked") {
      renderLikedSongs();
      return;
    }
    const sectionMatch = path.match(/^\/section\/([^/]+)/);
    if (sectionMatch) {
      renderSection(sectionMatch[1]);
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
  if (location.pathname === "/profile") {
    renderProfile();
  } else if (location.pathname === "/liked") {
    renderLikedSongs();
  } else if (location.pathname.startsWith("/section/")) {
    const sectionId = location.pathname.split("/section/")[1]?.split("?")[0]?.split("#")[0];
    if (sectionId) renderSection(sectionId);
  } else {
    const initialMatch = location.pathname.match(/^\/(playlist|artist|album|track)\/([^/]+)/);
    if (initialMatch) {
      const [, type, id] = initialMatch;
      renderDetail(type, id);
    }
  }
}
