import { httpRequest, HttpError } from "../services/http.js";
import { getSession, isLoggedIn } from "../services/auth.js";
import { enablePlaylistEditing } from "./playlist.js";
import { setQueue, normalizeTrack } from "./player.js";

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
        ? `<button class="pill-button ${following ? "pill-button--ghost" : "pill-button--white"} px-5 py-2 text-sm" type="button" data-detail-follow aria-pressed="${following}">${following ? "Following" : "Follow"}</button>`
        : `<button class="detail-heart-btn${following ? " is-active" : ""}" type="button" data-detail-follow aria-label="${following ? "Remove from Liked Songs" : "Save to Liked Songs"}" aria-pressed="${following}"><i class="ph-fill ph-heart text-[24px] leading-none" aria-hidden="true"></i></button>`
      : "";

    const actionsHtml = isOwner
      ? `<div class="detail-hero__actions">
           <button class="detail-play-btn" type="button" aria-label="Play"><i class="ph-fill ph-play text-[24px] leading-none" aria-hidden="true"></i></button>
           <button class="detail-action-icon" type="button" data-playlist-edit aria-label="Edit playlist">
             <i class="ph-fill ph-pencil text-[16px] leading-none" aria-hidden="true"></i>
           </button>
           <button class="detail-action-icon detail-action-icon--danger" type="button" data-playlist-delete aria-label="Delete playlist">
             <i class="ph-fill ph-trash text-[16px] leading-none" aria-hidden="true"></i>
           </button>
           <button class="pill-button ${entity.is_public ? "pill-button--ghost" : "pill-button--white"} px-5 py-2 text-sm" type="button" data-playlist-visibility data-is-public="${!!entity.is_public}">${entity.is_public ? "Make private" : "Make public"}</button>
         </div>`
      : `<div class="detail-hero__actions">
           <button class="detail-play-btn" type="button" aria-label="Play"><i class="ph-fill ph-play text-[24px] leading-none" aria-hidden="true"></i></button>
           ${followBtn}
         </div>`;

    const metaHtml = [
      entity.user_display_name ? `By ${escapeHtml(entity.user_display_name)}` : "",
      entity.monthly_listeners ? `${Number(entity.monthly_listeners).toLocaleString("vi-VN")} monthly listeners` : "",
      subtitle ? escapeHtml(subtitle) : "",
    ].filter(Boolean).join(" · ");

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
          <button class="detail-track__play-btn" type="button" aria-label="Play ${escapeHtml(t.title || "")}"><i class="ph-fill ph-play text-[14px] leading-none" aria-hidden="true"></i></button>
          <img class="detail-track__thumb" src="${escapeHtml(thumb)}" alt="" width="40" height="40" loading="lazy" />
          <div class="detail-track__info">
            <span class="detail-track__title">${escapeHtml(t.title || t.name || "Track")}</span>
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
            <span class="detail-tracks__title-col">Title</span>
            ${albumHeader}
            <span class="detail-tracks__duration-col"><i class="ph-fill ph-clock text-[14px] leading-none" aria-hidden="true"></i></span>
          </div>
          <ol class="detail-tracks__list">${trackRows}</ol>
        </div>`;
    }

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
            <p class="detail-hero__type">${type}</p>
            <h1 class="detail-hero__title${isOwner ? " detail-title--editable" : ""}" ${isOwner ? 'data-playlist-edit' : ""}>${escapeHtml(title)}</h1>
            ${metaHtml ? `<p class="detail-hero__meta">${metaHtml}</p>` : ""}
            ${actionsHtml}
          </div>
        </div>
      </section>
      ${trackTableHtml}
    `;

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
      const updateFollowBtn = () => {
        if (isFollow) {
          followEl.className = `pill-button ${following ? "pill-button--ghost" : "pill-button--white"} px-5 py-2 text-sm`;
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

async function renderLikedSongs() {
  showDetail();
  detailView.innerHTML = `<div class="detail-loading"><p class="text-white">Đang tải...</p></div>`;

  try {
    const data = await httpRequest.get("/api/me/tracks/liked?limit=50", { auth: true });
    const tracks = data.tracks || [];
    const countText = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;

    const trackRows = tracks.map((t, i) => {
      const thumb = t.image_url || t.album_cover_image_url || "";
      return `<li class="detail-track" data-track-id="${escapeHtml(t.id)}">
        <span class="detail-track__number">${i + 1}</span>
        <button class="detail-track__play-btn" type="button" aria-label="Play ${escapeHtml(t.title || "")}"><i class="ph-fill ph-play text-[14px] leading-none" aria-hidden="true"></i></button>
        ${thumb ? `<img class="detail-track__thumb" src="${escapeHtml(thumb)}" alt="" width="40" height="40" loading="lazy" />` : ""}
        <div class="detail-track__info">
          <span class="detail-track__title">${escapeHtml(t.title || "Track")}</span>
          <span class="detail-track__artist">${escapeHtml(t.artist_name || "")}</span>
        </div>
        <span class="detail-tracks__duration">${t.duration ? formatDuration(t.duration) : ""}</span>
        <button class="detail-heart-btn is-active" type="button" data-liked-unlike aria-label="Remove from Liked Songs" aria-pressed="true">
          <i class="ph-fill ph-heart text-[16px] leading-none" aria-hidden="true"></i>
        </button>
      </li>`;
    }).join("");

    detailView.innerHTML = `
      <section class="detail-hero detail-hero--liked">
        <div class="detail-hero__gradient"></div>
        <div class="detail-hero__content">
          <div class="detail-hero__cover detail-hero__cover--liked" aria-hidden="true">
            <i class="ph-fill ph-heart text-[48px] leading-none"></i>
          </div>
          <div class="detail-hero__info">
            <p class="detail-hero__type">Playlist</p>
            <h1 class="detail-hero__title">Liked Songs</h1>
            <p class="detail-hero__meta">${countText}</p>
            <div class="detail-hero__actions">
              <button class="detail-play-btn" type="button" aria-label="Play Liked Songs"><i class="ph-fill ph-play text-[24px] leading-none" aria-hidden="true"></i></button>
            </div>
          </div>
        </div>
      </section>
      ${tracks.length ? `
      <div class="detail-tracks">
        <div class="detail-tracks__header">
          <span class="detail-tracks__num-col">#</span>
          <span class="detail-tracks__title-col">Title</span>
          <span class="detail-tracks__duration-col"><i class="ph-fill ph-clock text-[14px] leading-none" aria-hidden="true"></i></span>
        </div>
        <ol class="detail-tracks__list">${trackRows}</ol>
      </div>` : `<p class="text-subdued mt-8 px-6">No liked songs yet.</p>`}
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
    likedRowBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        setQueue(likedQueue, idx, { type: "liked", id: "liked" });
      });
    });
    const likedHighlight = (track) => {
      detailView.querySelectorAll(".detail-track").forEach((row) => row.classList.remove("is-playing"));
      if (!track?.id) return;
      const idx = likedQueue.findIndex((t) => String(t.id) === String(track.id));
      if (idx >= 0) {
        const row = detailView.querySelectorAll(".detail-track")[idx];
        if (row) row.classList.add("is-playing");
      }
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
  } else {
    const initialMatch = location.pathname.match(/^\/(playlist|artist|album|track)\/([^/]+)/);
    if (initialMatch) {
      const [, type, id] = initialMatch;
      renderDetail(type, id);
    }
  }
}
