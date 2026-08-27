const FALLBACK_IMAGE =
  "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg";

function isValidCoverUrl(src) {
  if (!src) return false;
  if (src.length > 2000) return false;
  if (src.startsWith("data:")) return false;
  if (src.includes("devdata:")) return false;
  return true;
}

function createCoverImage({ src, alt }) {
  const img = document.createElement("img");
  img.src = isValidCoverUrl(src) ? src : FALLBACK_IMAGE;
  img.alt = alt;
  img.loading = "lazy";
  img.width = 178;
  img.height = 178;
  img.addEventListener("error", () => {
    if (img.src === FALLBACK_IMAGE) return;
    img.src = FALLBACK_IMAGE;
  });
  return img;
}

function bindDetail(el, type, id, title) {
  el.dataset.detail = "";
  el.dataset.type = type;
  el.dataset.id = id;
  el.dataset.title = title;
  el.href = `/${type}/${id}`;
}

export function createTrackCard(track) {
  const li = document.createElement("li");
  li.className = "media-card";

  const link = document.createElement("a");
  link.className = "media-card__link";
  bindDetail(link, "track", track.id, track.title);
  link.setAttribute("aria-label", track.title);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover";

  const img = createCoverImage({
    src: track.image_url,
    alt: `Cover of ${track.title}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("button");
  playLink.type = "button";
  playLink.className = "media-card__play";
  playLink.dataset.playTrack = "";
  playLink.dataset.id = track.id;
  playLink.dataset.title = track.title;
  playLink.dataset.type = "track";
  playLink.setAttribute("aria-label", `Play ${track.title}`);
  // store serialized track for queue building without extra fetch
  playLink._track = track;

  const playIcon = document.createElement("i");
  playIcon.className = "ph-fill ph-play text-[20px] leading-none";
  playIcon.setAttribute("aria-hidden", "true");
  playLink.appendChild(playIcon);
  cover.appendChild(playLink);

  li.appendChild(cover);

  const body = document.createElement("div");
  body.className = "media-card__body";

  const title = document.createElement("a");
  title.className = "media-card__title";
  bindDetail(title, "track", track.id, track.title);
  title.textContent = track.title;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  bindDetail(subtitle, "track", track.id, track.title);
  subtitle.textContent = track.artist_name;
  body.appendChild(subtitle);

  li.appendChild(body);

  return li;
}

export function createArtistCard(artist) {
  const li = document.createElement("li");
  li.className = "media-card";

  const link = document.createElement("a");
  link.className = "media-card__link";
  bindDetail(link, "artist", artist.id, artist.name);
  link.setAttribute("aria-label", artist.name);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover media-card__cover--round";

  const img = createCoverImage({
    src: artist.image_url,
    alt: `Cover of ${artist.name}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("button");
  playLink.type = "button";
  playLink.className = "media-card__play";
  playLink.dataset.playContext = "";
  playLink.dataset.id = artist.id;
  playLink.dataset.type = "artist";
  playLink.dataset.title = artist.name;
  playLink.setAttribute("aria-label", `Play ${artist.name}`);
  playLink._artist = artist;

  const playIcon = document.createElement("i");
  playIcon.className = "ph-fill ph-play text-[20px] leading-none";
  playIcon.setAttribute("aria-hidden", "true");
  playLink.appendChild(playIcon);
  cover.appendChild(playLink);

  li.appendChild(cover);

  const body = document.createElement("div");
  body.className = "media-card__body";

  const title = document.createElement("a");
  title.className = "media-card__title";
  bindDetail(title, "artist", artist.id, artist.name);
  title.textContent = artist.name;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  bindDetail(subtitle, "artist", artist.id, artist.name);
  subtitle.textContent = "Artist";
  body.appendChild(subtitle);

  li.appendChild(body);

  return li;
}

export function createAlbumCard(album) {
  const li = document.createElement("li");
  li.className = "media-card";

  const link = document.createElement("a");
  link.className = "media-card__link";
  bindDetail(link, "album", album.id, album.title);
  link.setAttribute("aria-label", album.title);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover";

  const img = createCoverImage({
    src: album.cover_image_url,
    alt: `Cover of ${album.title}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("button");
  playLink.type = "button";
  playLink.className = "media-card__play";
  playLink.dataset.playContext = "";
  playLink.dataset.id = album.id;
  playLink.dataset.type = "album";
  playLink.dataset.title = album.title;
  playLink.setAttribute("aria-label", `Play ${album.title}`);
  playLink._album = album;

  const playIcon = document.createElement("i");
  playIcon.className = "ph-fill ph-play text-[20px] leading-none";
  playIcon.setAttribute("aria-hidden", "true");
  playLink.appendChild(playIcon);
  cover.appendChild(playLink);

  li.appendChild(cover);

  const body = document.createElement("div");
  body.className = "media-card__body";

  const title = document.createElement("a");
  title.className = "media-card__title";
  bindDetail(title, "album", album.id, album.title);
  title.textContent = album.title;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  bindDetail(subtitle, "album", album.id, album.title);
  subtitle.textContent = album.artist_name;
  body.appendChild(subtitle);

  li.appendChild(body);

  return li;
}

export function createPlaylistCard(playlist) {
  const li = document.createElement("li");
  li.className = "media-card";

  const link = document.createElement("a");
  link.className = "media-card__link";
  bindDetail(link, "playlist", playlist.id, playlist.name);
  link.setAttribute("aria-label", playlist.name);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover";

  const img = createCoverImage({
    src: playlist.image_url,
    alt: `Cover of ${playlist.name}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("button");
  playLink.type = "button";
  playLink.className = "media-card__play";
  playLink.dataset.playContext = "";
  playLink.dataset.id = playlist.id;
  playLink.dataset.type = "playlist";
  playLink.dataset.title = playlist.name;
  playLink.setAttribute("aria-label", `Play ${playlist.name}`);
  playLink._playlist = playlist;

  const playIcon = document.createElement("i");
  playIcon.className = "ph-fill ph-play text-[20px] leading-none";
  playIcon.setAttribute("aria-hidden", "true");
  playLink.appendChild(playIcon);
  cover.appendChild(playLink);

  li.appendChild(cover);

  const body = document.createElement("div");
  body.className = "media-card__body";

  const title = document.createElement("a");
  title.className = "media-card__title";
  bindDetail(title, "playlist", playlist.id, playlist.name);
  title.textContent = playlist.name;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  bindDetail(subtitle, "playlist", playlist.id, playlist.name);
  subtitle.textContent = playlist.description;
  body.appendChild(subtitle);

  li.appendChild(body);

  return li;
}
