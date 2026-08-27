import { httpRequest } from "../services/http.js";
import {
  createTrackCard,
  createArtistCard,
  createAlbumCard,
  createPlaylistCard,
} from "./renderCards.js";
import { initCarousels } from "./carouselBtn.js";
import { ensureSession, initAuthUI } from "./authUI.js";
import { initSearch, navigateToDetail } from "./search.js";
import { initLibrary } from "./library.js";
import { createPlaylist } from "./playlist.js";
import { isLoggedIn } from "../services/auth.js";
import { initPlayer, setQueue, normalizeTrack } from "./player.js";

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

function initCreatePlaylist() {
  const btn = document.querySelector("[data-create-playlist]");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      location.href = "/login.html?message=Vui lòng đăng nhập.";
      return;
    }
    btn.disabled = true;
    try {
      const pl = await createPlaylist();
      window.dispatchEvent(new Event("library:refresh"));
      navigateToDetail("playlist", pl.id, pl.name || "My Playlist");
    } catch (error) {
      showToast(error.message || "Không thể tạo playlist.");
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderTrendingSongs() {
  const grid = document
    .querySelector("#trending-songs")
    ?.closest(".section-group")
    ?.querySelector(".card-grid");
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const data = await httpRequest.get("/api/tracks/popular?limit=20");
    data.tracks.forEach((track) => grid.appendChild(createTrackCard(track)));
  } catch (error) {
    const fallback = document.createElement("li");
    fallback.className = "media-card flex flex-1 justify-center";
    fallback.textContent = "Không thể tải dữ liệu. Vui lòng thử lại.";
    grid.appendChild(fallback);
    console.error(error);
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

async function renderPopularArtist() {
  const grid = document
    .querySelector("#popular-artists")
    ?.closest(".section-group")
    ?.querySelector(".card-grid");
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const data = await httpRequest.get("/api/artists/trending?limit=20");
    data.artists.forEach((artist) =>
      grid.appendChild(createArtistCard(artist)),
    );
  } catch (error) {
    const fallback = document.createElement("li");
    fallback.className = "media-card flex flex-1 justify-center";
    fallback.textContent = "Không thể tải dữ liệu. Vui lòng thử lại.";
    grid.appendChild(fallback);
    console.error(error);
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

async function renderPopularAlbums() {
  const grid = document
    .querySelector("#popular-albums")
    ?.closest(".section-group")
    ?.querySelector(".card-grid");
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const data = await httpRequest.get("/api/albums/popular?limit=20");
    data.albums.forEach((album) => grid.appendChild(createAlbumCard(album)));
  } catch (error) {
    const fallback = document.createElement("li");
    fallback.className = "media-card flex flex-1 justify-center";
    fallback.textContent = "Không thể tải dữ liệu. Vui lòng thử lại.";
    grid.appendChild(fallback);
    console.error(error);
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

async function renderAllPlaylists() {
  const grid = document
    .querySelector("#all-playlists")
    ?.closest(".section-group")
    ?.querySelector(".card-grid");
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const data = await httpRequest.get("/api/playlists?limit=20&offset=0&");
    data.playlists.forEach((playlist) =>
      grid.appendChild(createPlaylistCard(playlist)),
    );
  } catch (error) {
    const fallback = document.createElement("li");
    fallback.className = "media-card flex flex-1 justify-center";
    fallback.textContent = "Không thể tải dữ liệu. Vui lòng thử lại.";
    grid.appendChild(fallback);
    console.error(error);
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

await ensureSession();
initAuthUI();
initPlayer();
initSearch();
initLibrary();
initCreatePlaylist();

// Scrollbar is-scrolling — hiện thumb khi wheel/trackpad cuộn, 800ms sau ẩn
const sbEls = document.querySelectorAll(".app-sidebar, .app-main");
let sbTimer;
sbEls.forEach((el) => {
  el.addEventListener(
    "scroll",
    () => {
      el.classList.add("is-scrolling");
      clearTimeout(sbTimer);
      sbTimer = setTimeout(() => sbEls.forEach((e) => e.classList.remove("is-scrolling")), 800);
    },
    { passive: true },
  );
});

await renderTrendingSongs();
await renderPopularArtist();
await renderPopularAlbums();
await renderAllPlaylists();
initCarousels();

document.addEventListener("click", (e) => {
  // Allow auth pages to navigate normally (fix modal login/signup from detail)
  if (e.target.closest('a[href*="login.html"], a[href*="signup.html"]')) return;
  // Card play buttons — highest priority (track queue)
  const playTrackBtn = e.target.closest("[data-play-track]");
  if (playTrackBtn) {
    e.preventDefault();
    e.stopPropagation();
    const track = playTrackBtn._track;
    if (track) {
      const grid = playTrackBtn.closest(".card-grid");
      if (grid) {
        const allBtns = [...grid.querySelectorAll("[data-play-track]")];
        const allTracks = allBtns.map((b) => b._track).filter(Boolean).map((t) => normalizeTrack(t));
        const idx = allBtns.indexOf(playTrackBtn);
        if (allTracks.length > 1 && idx >= 0) {
          setQueue(allTracks, idx, { type: "track", id: track.id });
        } else {
          setQueue([normalizeTrack(track)], 0, { type: "track", id: track.id });
        }
      } else {
        setQueue([normalizeTrack(track)], 0, { type: "track", id: track.id });
      }
    }
    return;
  }

  const playContextBtn = e.target.closest("[data-play-context]");
  if (playContextBtn) {
    e.preventDefault();
    e.stopPropagation();
    const type = playContextBtn.dataset.type;
    const id = playContextBtn.dataset.id;
    if (!type || !id) return;
    playContextBtn.disabled = true;
    const endpointMap = {
      playlist: `/api/playlists/${id}`,
      artist: `/api/artists/${id}`,
      album: `/api/albums/${id}`,
    };
    const endpoint = endpointMap[type] || `/api/playlists/${id}`;
    httpRequest
      .get(endpoint, { auth: true })
      .then((data) => {
        const entity = data.playlist || data.artist || data.album || data.data || data;
        const tracks = entity.tracks || [];
        if (type === "artist" && !tracks.length && entity.id) {
          // fallback: fetch artist popular tracks
          return httpRequest.get(`/api/artists/${id}/tracks/popular`).then((d) => d.tracks || d.data || []).catch(() => []);
        }
        return tracks;
      })
      .then((tracks) => {
        if (Array.isArray(tracks) && tracks.length > 0) {
          const q = tracks.map((t) => normalizeTrack(t));
          setQueue(q, 0, { type, id });
        } else if (type === "track") {
          // single track fallback
          httpRequest.get(`/api/tracks/${id}`).then((data) => {
            const t = data.track || data.data || data;
            if (t?.audio_url || t?.id) setQueue([normalizeTrack(t)], 0, { type, id });
            else showToast("Không có bài hát để phát.");
          }).catch(() => showToast("Không thể tải bài hát."));
        } else {
          showToast("Không có bài hát để phát.");
          // also navigate to detail so user can see
          navigateToDetail(type, id, playContextBtn.dataset.title);
        }
      })
      .catch(() => showToast("Không thể tải danh sách phát."))
      .finally(() => {
        playContextBtn.disabled = false;
      });
    return;
  }

  const link = e.target.closest("a[data-detail]");
  if (!link) return;
  e.preventDefault();
  navigateToDetail(link.dataset.type, link.dataset.id, link.dataset.title);
});
