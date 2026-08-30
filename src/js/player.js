import { httpRequest, baseUrl } from "../services/http.js";
import { isLoggedIn } from "../services/auth.js";

function resolveAudioUrl(path) {
  if (!path) return "";
  const abs = /^https?:\/\//.test(path) ? path.replace(/^http:/, "https:") : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  return abs;
}

const FALLBACK_COVER = "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg";

const VOLUME_KEY = "spotify-volume";
const SHUFFLE_KEY = "spotify-shuffle";
const REPEAT_KEY = "spotify-repeat";

const audio = new Audio();
audio.preload = "auto";
audio.removeAttribute("crossorigin");

let queue = [];
let originalQueue = [];
let currentIndex = -1;
let shuffle = localStorage.getItem(SHUFFLE_KEY) === "1";
let repeat = localStorage.getItem(REPEAT_KEY) || "off"; // off | context | track
let contextInfo = null; // { type, id }
let isSeeking = false;
let seekDebounce = null;
let volumeDebounce = null;

let els = {};
let toastTimer = null;

function showToast(message) {
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;
  const msgEl = toastEl.querySelector(".toast__message");
  if (msgEl) msgEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2500);
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isValidCoverUrl(src) {
  if (!src) return false;
  if (src.length > 2000) return false;
  if (src.startsWith("data:")) return false;
  if (src.includes("devdata:")) return false;
  return true;
}

function getTrackCover(track) {
  return track?.image_url || track?.cover_image_url || track?.album_cover_image_url || track?.artist_image_url || "";
}

function getTrackArtist(track) {
  return track?.artist_name || track?.artist || track?.user_display_name || "";
}

export function showAuthModal() {
  const modal = document.getElementById("auth-required-modal");
  if (!modal) {
    location.href = "/signup.html";
    return;
  }
  modal.removeAttribute("hidden");
  const signupBtn = modal.querySelector("[data-auth-modal-signup]");
  if (signupBtn) signupBtn.focus();
  document.body.style.overflow = "hidden";
}

function hideAuthModal() {
  const modal = document.getElementById("auth-required-modal");
  if (!modal) return;
  modal.setAttribute("hidden", "");
  document.body.style.overflow = "";
}

function ensureAuthOrModal() {
  if (isLoggedIn()) return true;
  showAuthModal();
  return false;
}

function persistState() {
  try {
    localStorage.setItem(VOLUME_KEY, String(audio.volume));
    localStorage.setItem(SHUFFLE_KEY, shuffle ? "1" : "0");
    localStorage.setItem(REPEAT_KEY, repeat);
  } catch {}
}

function updateSliderFill(input, percent) {
  if (!input) return;
  const p = Math.max(0, Math.min(100, percent));
  // single CSS var fill - allowed exception to no-js-styles rule
  input.style.setProperty("--progress", `${p}%`);
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || track.name || "Unknown",
      artist: getTrackArtist(track) || "",
      album: track.album_title || "",
      artwork: isValidCoverUrl(getTrackCover(track))
        ? [{ src: getTrackCover(track), sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
    navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
  } catch {}
}

function updateLikeUI(track) {
  if (!els.likeBtn) return;
  const liked = !!track?.is_liked;
  els.likeBtn.classList.toggle("is-active", liked);
  els.likeBtn.setAttribute("aria-pressed", String(liked));
  const likeLabel = liked ? "Xóa khỏi Bài hát đã thích" : "Lưu vào Bài hát đã thích";
  els.likeBtn.setAttribute("aria-label", likeLabel);
  els.likeBtn.dataset.tooltip = likeLabel;
  const icon = els.likeBtn.querySelector("i");
  if (icon) {
    icon.className = liked ? "ph-fill ph-heart text-[16px] leading-none" : "ph-fill ph-heart text-[16px] leading-none";
  }
}

function updateTrackInfo(track) {
  if (!track) {
    if (els.trackWrap) els.trackWrap.hidden = true;
    if (els.placeholder) els.placeholder.hidden = false;
    if (els.cover) els.cover.hidden = true;
    if (els.titleEl) els.titleEl.textContent = "";
    if (els.artistEl) els.artistEl.textContent = "";
    return;
  }
  if (els.trackWrap) els.trackWrap.hidden = false;
  if (els.placeholder) els.placeholder.hidden = true;

  const coverUrl = getTrackCover(track);
  if (els.cover) {
    if (isValidCoverUrl(coverUrl)) {
      els.cover.src = coverUrl;
      els.cover.alt = `Cover of ${track.title || track.name || ""}`;
      els.cover.hidden = false;
      els.cover.onerror = () => {
        els.cover.src = FALLBACK_COVER;
      };
    } else {
      els.cover.src = FALLBACK_COVER;
      els.cover.alt = "";
      els.cover.hidden = false;
    }
  }
  if (els.titleEl) {
    els.titleEl.textContent = track.title || track.name || "Unknown";
    els.titleEl.href = track.id ? `/track/${track.id}` : "#";
    els.titleEl.dataset.detail = "";
    els.titleEl.dataset.type = "track";
    els.titleEl.dataset.id = track.id || "";
    els.titleEl.dataset.title = track.title || track.name || "";
  }
  if (els.artistEl) {
    els.artistEl.textContent = getTrackArtist(track);
    if (track.artist_id) {
      els.artistEl.href = `/artist/${track.artist_id}`;
      els.artistEl.dataset.detail = "";
      els.artistEl.dataset.type = "artist";
      els.artistEl.dataset.id = track.artist_id;
      els.artistEl.dataset.title = getTrackArtist(track);
    } else {
      els.artistEl.removeAttribute("href");
    }
  }
  updateLikeUI(track);
  updateMediaSession(track);
  dispatchTrackChange(track);
}

function dispatchTrackChange(track) {
  window.dispatchEvent(new CustomEvent("player:trackchange", { detail: { track, index: currentIndex, queue } }));
}

function dispatchStateChange() {
  window.dispatchEvent(new CustomEvent("player:statechange", { detail: getState() }));
}

function getState() {
  const track = queue[currentIndex] || null;
  return {
    track,
    queue,
    currentIndex,
    isPlaying: !audio.paused,
    currentTime: audio.currentTime || 0,
    duration: audio.duration || track?.duration || 0,
    volume: audio.volume,
    muted: audio.muted,
    shuffle,
    repeat,
    context: contextInfo,
  };
}

function updatePlayButton() {
  if (!els.playBtn) return;
  const isPlaying = !audio.paused;
  const icon = els.playBtn.querySelector("i");
  if (icon) {
    icon.className = isPlaying ? "ph-fill ph-pause text-[20px] leading-none" : "ph-fill ph-play text-[20px] leading-none";
  }
  const playLabel = isPlaying ? "Tạm dừng" : "Phát";
  els.playBtn.setAttribute("aria-label", playLabel);
  els.playBtn.dataset.tooltip = playLabel;
}

function updateShuffleUI() {
  if (!els.shuffleBtn) return;
  els.shuffleBtn.classList.toggle("is-active", shuffle);
  els.shuffleBtn.setAttribute("aria-pressed", String(shuffle));
  const shuffleLabel = shuffle ? "Tắt trộn bài" : "Bật trộn bài";
  els.shuffleBtn.setAttribute("aria-label", shuffleLabel);
  els.shuffleBtn.dataset.tooltip = shuffleLabel;
}

function updateRepeatUI() {
  if (!els.repeatBtn) return;
  els.repeatBtn.classList.toggle("is-active", repeat !== "off");
  els.repeatBtn.classList.toggle("is-repeat-track", repeat === "track");
  els.repeatBtn.classList.toggle("is-repeat-context", repeat === "context");
  els.repeatBtn.setAttribute("aria-pressed", String(repeat !== "off"));
  const label = repeat === "off" ? "Bật lặp lại" : repeat === "track" ? "Tắt lặp lại" : "Bật lặp lại một bài";
  els.repeatBtn.setAttribute("aria-label", label);
  els.repeatBtn.dataset.tooltip = label;
  els.repeatBtn.setAttribute("data-repeat", repeat);
}

function updateTimeUI() {
  const duration = audio.duration || queue[currentIndex]?.duration || 0;
  if (els.currentEl) els.currentEl.textContent = formatTime(audio.currentTime || 0);
  if (els.durationEl) els.durationEl.textContent = formatTime(duration || 0);
  if (els.progress) {
    const pct = duration ? (audio.currentTime / duration) * 100 : 0;
    if (!isSeeking) {
      els.progress.value = String(Math.round(pct));
      els.progress.setAttribute("aria-valuenow", String(Math.round(pct)));
      updateSliderFill(els.progress, pct);
    }
  }
}

function updateVolumeUI() {
  if (!els.volume) return;
  const pct = audio.muted ? 0 : Math.round(audio.volume * 100);
  els.volume.value = String(pct);
  els.volume.setAttribute("aria-valuenow", String(pct));
  updateSliderFill(els.volume, pct);
  if (els.muteBtn) {
    const icon = els.muteBtn.querySelector("i");
    let cls = "ph-fill ph-speaker-high text-[16px] leading-none";
    if (audio.muted || pct === 0) cls = "ph-fill ph-speaker-none text-[16px] leading-none";
    else if (pct < 50) cls = "ph-fill ph-speaker-low text-[16px] leading-none";
    if (icon) icon.className = cls;
    const muteLabel = audio.muted || pct === 0 ? "Bật tiếng" : "Tắt tiếng";
    els.muteBtn.setAttribute("aria-label", muteLabel);
    els.muteBtn.dataset.tooltip = muteLabel;
  }
}

function syncBackend(path, method, body) {
  if (!isLoggedIn()) return;
  // fire-and-forget best-effort: swallow 500/CORS so playback is never blocked (local-first)
  const promise =
    method === "PUT"
      ? httpRequest.put(path, body || {}, { auth: true })
      : method === "POST"
        ? httpRequest.post(path, body || {}, { auth: true })
        : method === "GET"
          ? httpRequest.get(path, { auth: true })
          : Promise.resolve(null);
  promise.catch((e) => {
    const msg = e?.message || "";
    const isCorsOrServer = e?.status === 500 || /CORS|Failed to fetch|NetworkError/i.test(msg);
    if (isCorsOrServer) {
      console.warn("[player sync skipped]", method, path, e.status || msg);
      return;
    }
    console.warn("[player sync]", method, path, msg);
  });
  return promise;
}

function buildQueueFromTracks(tracks) {
  return tracks.map((t) => ({ ...t }));
}

function shuffleQueue() {
  if (!shuffle) {
    // restore original order but keep current track index correct
    const currentId = queue[currentIndex]?.id;
    queue = [...originalQueue];
    currentIndex = queue.findIndex((t) => t.id === currentId);
    if (currentIndex === -1) currentIndex = 0;
    return;
  }
  // enable shuffle: Fisher-Yates, keep current track at position 0 logic? Spotify keeps current but shuffles rest.
  const current = queue[currentIndex];
  const rest = queue.filter((_, i) => i !== currentIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  queue = current ? [current, ...rest] : rest;
  currentIndex = 0;
}

export function setQueue(tracks, startIndex = 0, context = null) {
  if (!ensureAuthOrModal()) return;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    showToast("Không có bài hát để phát.");
    return;
  }
  originalQueue = buildQueueFromTracks(tracks);
  queue = buildQueueFromTracks(tracks);
  contextInfo = context;
  currentIndex = Math.max(0, Math.min(startIndex, queue.length - 1));
  // apply shuffle if enabled: shuffle after setting queue but keep start track first
  if (shuffle) {
    const startTrack = queue[currentIndex];
    const others = queue.filter((_, i) => i !== currentIndex);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    queue = [startTrack, ...others];
    currentIndex = 0;
    originalQueue = buildQueueFromTracks(tracks);
  }
  loadTrack(currentIndex, true);
}

async function loadTrack(index, autoplay = false) {
  if (index < 0 || index >= queue.length) return;
  currentIndex = index;
  const track = queue[currentIndex];
  updateTrackInfo(track);

  // resolve audio_url: if missing, fetch track detail
  let src = track.audio_url;
  if (!src && track.id) {
    try {
      const data = await httpRequest.get(`/api/tracks/${track.id}`);
      const fetched = data.track || data.data || data;
      src = fetched.audio_url || fetched.audioUrl || "";
      if (src) {
        track.audio_url = src;
        track.duration = fetched.duration || track.duration;
      }
    } catch {}
  }
  if (!src) {
    showToast("Bài hát chưa có nguồn phát.");
    // auto skip to next if autoplay?
    if (autoplay) {
      // try next
      setTimeout(() => next(true), 300);
    }
    return;
  }
  const resolvedSrc = resolveAudioUrl(src);
  audio.src = resolvedSrc;
  audio.currentTime = 0;
  if (autoplay) {
    try {
      await audio.play();
    } catch (e) {
      if (e.name === "NotAllowedError") showToast("Nhấn Play để bắt đầu phát.");
      else showToast(e.message || "Không thể phát bài hát.");
    }
  }
  dispatchStateChange();
  // sync backend last — never blocks local playback (500/CORS is swallowed)
  syncBackend("/api/me/player/play", "PUT", {
    track_id: track.id,
    context_type: contextInfo?.type || "track",
    context_id: contextInfo?.id || track.id,
    position_ms: 0,
    volume_percent: Math.round(audio.volume * 100),
    device_name: "Web Player",
  });
}

export function togglePlay() {
  if (!ensureAuthOrModal()) return;
  if (!queue.length) {
    showToast("Chưa có bài hát trong hàng đợi.");
    return;
  }
  if (audio.paused) {
    if (!audio.src && currentIndex >= 0) {
      loadTrack(currentIndex, true);
      return;
    }
    audio.play().catch((e) => {
      if (e.name === "NotAllowedError") showToast("Nhấn Play để bắt đầu phát.");
      else showToast("Không thể phát.");
    });
    syncBackend("/api/me/player/play", "PUT", {
      track_id: queue[currentIndex]?.id,
      context_type: contextInfo?.type || "track",
      context_id: contextInfo?.id || queue[currentIndex]?.id,
      position_ms: Math.round(audio.currentTime * 1000),
      volume_percent: Math.round(audio.volume * 100),
      device_name: "Web Player",
    });
  } else {
    audio.pause();
    syncBackend("/api/me/player/pause", "PUT");
  }
}

export function next(isAuto = false) {
  if (!queue.length) return;
  if (!ensureAuthOrModal() && !isAuto) return;
  if (repeat === "track" && !isAuto) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  let nextIdx = currentIndex + 1;
  if (nextIdx >= queue.length) {
    if (repeat === "context") nextIdx = 0;
    else {
      // end of queue
      audio.pause();
      audio.currentTime = 0;
      updateTimeUI();
      return;
    }
  }
  loadTrack(nextIdx, !audio.paused || isAuto || true);
  if (!isAuto) syncBackend("/api/me/player/next", "POST");
}

export function prev() {
  if (!queue.length) return;
  if (!ensureAuthOrModal()) return;
  // if more than 3s, restart
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    syncBackend("/api/me/player/seek", "PUT", { position_ms: 0 });
    return;
  }
  let prevIdx = currentIndex - 1;
  if (prevIdx < 0) {
    if (repeat === "context") prevIdx = queue.length - 1;
    else {
      audio.currentTime = 0;
      return;
    }
  }
  loadTrack(prevIdx, true);
  syncBackend("/api/me/player/previous", "POST");
}

export function seekTo(seconds) {
  if (!Number.isFinite(seconds)) return;
  const duration = audio.duration || queue[currentIndex]?.duration || 0;
  const clamped = Math.max(0, Math.min(seconds, duration || seconds));
  audio.currentTime = clamped;
  updateTimeUI();
  clearTimeout(seekDebounce);
  seekDebounce = setTimeout(() => {
    syncBackend("/api/me/player/seek", "PUT", { position_ms: Math.round(clamped * 1000) });
  }, 300);
}

export function setVolume(percent) {
  const v = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  audio.volume = v;
  audio.muted = v === 0 ? false : audio.muted;
  if (v > 0) audio.muted = false;
  updateVolumeUI();
  persistState();
  clearTimeout(volumeDebounce);
  volumeDebounce = setTimeout(() => {
    syncBackend("/api/me/player/volume", "PUT", { volume_percent: Math.round(v * 100) });
  }, 300);
}

export function toggleMute() {
  audio.muted = !audio.muted;
  updateVolumeUI();
  persistState();
  syncBackend("/api/me/player/volume", "PUT", { volume_percent: audio.muted ? 0 : Math.round(audio.volume * 100) });
}

export function toggleShuffle() {
  if (!ensureAuthOrModal()) return;
  shuffle = !shuffle;
  updateShuffleUI();
  persistState();
  // reshuffle queue
  if (queue.length > 1) {
    shuffleQueue();
  }
  syncBackend("/api/me/player/shuffle", "PUT", { state: shuffle });
  showToast(shuffle ? "Đã bật trộn bài." : "Đã tắt trộn bài.");
}

export function cycleRepeat() {
  if (!ensureAuthOrModal()) return;
  const order = ["off", "context", "track"];
  const idx = order.indexOf(repeat);
  repeat = order[(idx + 1) % order.length];
  updateRepeatUI();
  persistState();
  syncBackend("/api/me/player/repeat", "PUT", { state: repeat });
  const msg = repeat === "off" ? "Đã tắt lặp lại." : repeat === "context" ? "Đã bật lặp lại tất cả." : "Đã bật lặp lại một bài.";
  showToast(msg);
}

async function toggleLike() {
  if (!isLoggedIn()) {
    showAuthModal();
    return;
  }
  const track = queue[currentIndex];
  if (!track?.id) {
    showToast("Không có bài hát để thích.");
    return;
  }
  // determine if track or album? player is always track
  const isLiked = !!track.is_liked;
  const url = `/api/tracks/${track.id}/like`;
  try {
    if (isLiked) await httpRequest.delete(url, { auth: true });
    else await httpRequest.post(url, {}, { auth: true });
    track.is_liked = !isLiked;
    // sync queue copies
    queue.forEach((t) => {
      if (String(t.id) === String(track.id)) t.is_liked = track.is_liked;
    });
    originalQueue.forEach((t) => {
      if (String(t.id) === String(track.id)) t.is_liked = track.is_liked;
    });
    updateLikeUI(track);
    window.dispatchEvent(new Event("library:refresh"));
    window.dispatchEvent(new CustomEvent("like:changed", { detail: { id: track.id, type: "track", is_liked: track.is_liked } }));
    showToast(track.is_liked ? "Đã thêm vào Bài hát đã thích." : "Đã xóa khỏi Bài hát đã thích.");
  } catch (e) {
    showToast(e.message || "Không thể cập nhật.");
  }
}

function bindAuthModal() {
  const modal = document.getElementById("auth-required-modal");
  if (!modal) return;
  const closeEls = modal.querySelectorAll("[data-auth-modal-close]");
  closeEls.forEach((el) => el.addEventListener("click", hideAuthModal));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideAuthModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hasAttribute("hidden")) hideAuthModal();
  });
}

function bindAudioEvents() {
  audio.addEventListener("timeupdate", () => {
    if (isSeeking) return;
    updateTimeUI();
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration || queue[currentIndex]?.duration || 0,
          playbackRate: audio.playbackRate || 1,
          position: audio.currentTime || 0,
        });
      } catch {}
    }
  });
  audio.addEventListener("loadedmetadata", () => {
    updateTimeUI();
  });
  audio.addEventListener("play", () => {
    updatePlayButton();
    updateMediaSession(queue[currentIndex]);
    dispatchStateChange();
  });
  audio.addEventListener("pause", () => {
    updatePlayButton();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    dispatchStateChange();
  });
  audio.addEventListener("ended", () => {
    const track = queue[currentIndex];
    if (track?.id) {
      syncBackend(`/api/tracks/${track.id}/complete`, "POST", { play_duration: Math.round(audio.duration || 0) });
    }
    if (repeat === "track") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    next(true);
  });
  audio.addEventListener("error", () => {
    const msg = audio.error?.message || "Không thể phát bài hát.";
    showToast(msg);
    // skip to next after error
    setTimeout(() => next(true), 600);
  });
}

function bindControls() {
  els.playBtn?.addEventListener("click", togglePlay);
  els.nextBtn?.addEventListener("click", () => next(false));
  els.prevBtn?.addEventListener("click", prev);
  els.shuffleBtn?.addEventListener("click", toggleShuffle);
  els.repeatBtn?.addEventListener("click", cycleRepeat);
  els.likeBtn?.addEventListener("click", toggleLike);
  els.muteBtn?.addEventListener("click", toggleMute);

  if (els.progress) {
    const onSeekStart = () => {
      isSeeking = true;
    };
    const onSeekEnd = () => {
      isSeeking = false;
      const pct = Number(els.progress.value) || 0;
      const duration = audio.duration || queue[currentIndex]?.duration || 0;
      const sec = duration ? (pct / 100) * duration : 0;
      seekTo(sec);
      updateSliderFill(els.progress, pct);
    };
    const onSeeking = () => {
      const pct = Number(els.progress.value) || 0;
      updateSliderFill(els.progress, pct);
      if (els.currentEl) {
        const duration = audio.duration || queue[currentIndex]?.duration || 0;
        const sec = duration ? (pct / 100) * duration : 0;
        els.currentEl.textContent = formatTime(sec);
      }
    };
    els.progress.addEventListener("pointerdown", onSeekStart);
    els.progress.addEventListener("touchstart", onSeekStart, { passive: true });
    els.progress.addEventListener("input", onSeeking);
    els.progress.addEventListener("change", onSeekEnd);
    els.progress.addEventListener("pointerup", onSeekEnd);
    els.progress.addEventListener("touchend", onSeekEnd);
  }

  if (els.volume) {
    updateSliderFill(els.volume, Math.round(audio.volume * 100));
    els.volume.addEventListener("input", () => {
      const pct = Number(els.volume.value) || 0;
      setVolume(pct);
      updateSliderFill(els.volume, pct);
    });
    els.volume.addEventListener("change", () => {
      const pct = Number(els.volume.value) || 0;
      updateSliderFill(els.volume, pct);
    });
  }
}

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isInput = tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable;
    if (isInput) return;
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
      if (e.shiftKey) next(false);
      else {
        e.preventDefault();
        seekTo((audio.currentTime || 0) + 5);
      }
    } else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
      if (e.shiftKey) prev();
      else {
        e.preventDefault();
        seekTo((audio.currentTime || 0) - 5);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setVolume(Math.min(100, Math.round(audio.volume * 100) + 5));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setVolume(Math.max(0, Math.round(audio.volume * 100) - 5));
    } else if (e.key.toLowerCase() === "m") {
      toggleMute();
    } else if (e.key.toLowerCase() === "s") {
      toggleShuffle();
    } else if (e.key.toLowerCase() === "r") {
      cycleRepeat();
    }
  });
}

function bindMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler("play", togglePlay);
    navigator.mediaSession.setActionHandler("pause", togglePlay);
    navigator.mediaSession.setActionHandler("nexttrack", () => next(false));
    navigator.mediaSession.setActionHandler("previoustrack", prev);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) seekTo(details.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      seekTo((audio.currentTime || 0) - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      seekTo((audio.currentTime || 0) + (details.seekOffset || 10));
    });
  } catch (e) {
    console.warn("MediaSession not supported", e);
  }
}

async function restoreFromBackend() {
  if (!isLoggedIn()) return;
  try {
    const data = await httpRequest.get("/api/me/player", { auth: true });
    const player = data.player || data.data || data;
    if (!player) return;
    if (typeof player.shuffle_state === "boolean") shuffle = !!player.shuffle_state;
    else if (typeof player.shuffle === "boolean") shuffle = !!player.shuffle;
    if (player.repeat_state) repeat = player.repeat_state;
    else if (player.repeat) repeat = player.repeat;
    if (typeof player.volume_percent === "number") {
      audio.volume = Math.max(0, Math.min(100, player.volume_percent)) / 100;
    } else if (typeof player.volume === "number") {
      audio.volume = Math.max(0, Math.min(1, player.volume));
    }
    // track restore only if valid audio_url present — otherwise keep local state
    const restored = player.track || player.current_track;
    if (restored?.audio_url || restored?.audioUrl) {
      const t = restored;
      queue = [t];
      originalQueue = [t];
      currentIndex = 0;
      updateTrackInfo(t);
      audio.src = resolveAudioUrl(t.audio_url || t.audioUrl);
      if (player.progress_ms) audio.currentTime = player.progress_ms / 1000;
      if (player.is_playing) {
        audio.play().catch(() => {});
      }
    } else if (restored && !restored.audio_url) {
      // no valid audio — ignore, keep local queue
      console.warn("[player restore skipped] no audio_url");
    }
    persistState();
    updateShuffleUI();
    updateRepeatUI();
    updateVolumeUI();
    updateTimeUI();
  } catch (e) {
    const msg = e?.message || "";
    if (e?.status === 500 || /CORS|Failed to fetch/i.test(msg)) {
      console.warn("[player restore skipped]", e.status || msg);
      return;
    }
  }
}

export function getCurrentTrack() {
  return queue[currentIndex] || null;
}

export function isShuffleEnabled() {
  return shuffle;
}

export function getRepeatMode() {
  return repeat;
}

export function initPlayer() {
  els = {
    trackWrap: document.querySelector("[data-player-track]"),
    placeholder: document.querySelector("[data-player-placeholder]"),
    cover: document.querySelector("[data-player-cover]"),
    titleEl: document.querySelector("[data-player-title]"),
    artistEl: document.querySelector("[data-player-artist]"),
    likeBtn: document.querySelector("[data-player-like]"),
    shuffleBtn: document.querySelector("[data-player-shuffle]"),
    prevBtn: document.querySelector("[data-player-prev]"),
    playBtn: document.querySelector("[data-player-play]"),
    nextBtn: document.querySelector("[data-player-next]"),
    repeatBtn: document.querySelector("[data-player-repeat]"),
    currentEl: document.querySelector("[data-player-current]"),
    progress: document.querySelector("[data-player-progress]"),
    durationEl: document.querySelector("[data-player-duration]"),
    muteBtn: document.querySelector("[data-player-mute]"),
    volume: document.querySelector("[data-player-volume]"),
  };

  // restore volume
  try {
    const savedVol = localStorage.getItem(VOLUME_KEY);
    if (savedVol != null) audio.volume = Math.max(0, Math.min(1, Number(savedVol)));
    else audio.volume = 0.8;
  } catch {
    audio.volume = 0.8;
  }

  bindAuthModal();
  bindAudioEvents();
  bindControls();
  bindKeyboard();
  bindMediaSession();

  updateShuffleUI();
  updateRepeatUI();
  updateVolumeUI();
  updateTimeUI();
  updatePlayButton();
  updateTrackInfo(null);

  restoreFromBackend();

  // expose for debugging
  window.__player = { audio, getState, setQueue, togglePlay, next, prev, seekTo, setVolume, toggleMute, toggleShuffle, cycleRepeat };

  // allow external like sync: when track liked elsewhere, update button
  window.addEventListener("player:trackchange", (e) => {
    // if detail view liked state changed, keep queue in sync
    const detailTrack = e.detail?.track;
    if (!detailTrack) return;
  });

  window.addEventListener("like:changed", (e) => {
    const { id, is_liked } = e.detail || {};
    if (!id) return;
    const cur = queue[currentIndex];
    if (cur && String(cur.id) === String(id)) {
      cur.is_liked = !!is_liked;
      updateLikeUI(cur);
    }
    queue.forEach((t) => {
      if (String(t.id) === String(id)) t.is_liked = !!is_liked;
    });
    originalQueue.forEach((t) => {
      if (String(t.id) === String(id)) t.is_liked = !!is_liked;
    });
  });

  return { audio, getState };
}

// helper to normalize track for queue: ensure required fields
export function normalizeTrack(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw._id,
    title: raw.title || raw.name || "Unknown",
    artist_name: raw.artist_name || raw.artist || "",
    artist_id: raw.artist_id || raw.artistId || "",
    image_url: raw.image_url || raw.cover_image_url || raw.album_cover_image_url || "",
    audio_url: raw.audio_url || raw.audioUrl || raw.preview_url || "",
    duration: raw.duration || 0,
    album_title: raw.album_title || "",
    album_cover_image_url: raw.album_cover_image_url || "",
    is_liked: !!raw.is_liked,
  };
}
