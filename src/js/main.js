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
initSearch();
initLibrary();
initCreatePlaylist();

await renderTrendingSongs();
await renderPopularArtist();
await renderPopularAlbums();
await renderAllPlaylists();
initCarousels();

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-detail]");
  if (!link) return;
  e.preventDefault();
  navigateToDetail(link.dataset.type, link.dataset.id, link.dataset.title);
});
