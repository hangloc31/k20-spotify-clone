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

export function createTrackCard(track) {
  const li = document.createElement("li");
  li.className = "media-card";

  const link = document.createElement("a");
  link.className = "media-card__link";
  link.href = "#";
  link.setAttribute("aria-label", track.title);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover";

  const img = createCoverImage({
    src: track.image_url,
    alt: `Cover of ${track.title}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("a");
  playLink.className = "media-card__play";
  playLink.href = "#";
  playLink.setAttribute("aria-label", `Play ${track.title}`);

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
  title.href = "#";
  title.textContent = track.title;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  subtitle.href = "#";
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
  link.href = "#";
  link.setAttribute("aria-label", artist.name);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover media-card__cover--round";

  const img = createCoverImage({
    src: artist.image_url,
    alt: `Cover of ${artist.name}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("a");
  playLink.className = "media-card__play";
  playLink.href = "#";
  playLink.setAttribute("aria-label", `Play ${artist.name}`);

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
  title.href = "#";
  title.textContent = artist.name;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  subtitle.href = "#";
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
  link.href = "#";
  link.setAttribute("aria-label", album.title);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover";

  const img = createCoverImage({
    src: album.cover_image_url,
    alt: `Cover of ${album.title}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("a");
  playLink.className = "media-card__play";
  playLink.href = "#";
  playLink.setAttribute("aria-label", `Play ${album.title}`);

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
  title.href = "#";
  title.textContent = album.title;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  subtitle.href = "#";
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
  link.href = "#";
  link.setAttribute("aria-label", playlist.name);
  li.appendChild(link);

  const cover = document.createElement("div");
  cover.className = "media-card__cover";

  const img = createCoverImage({
    src: playlist.image_url,
    alt: `Cover of ${playlist.name}`,
  });
  cover.appendChild(img);

  const playLink = document.createElement("a");
  playLink.className = "media-card__play";
  playLink.href = "#";
  playLink.setAttribute("aria-label", `Play ${playlist.name}`);

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
  title.href = "#";
  title.textContent = playlist.name;
  body.appendChild(title);

  const subtitle = document.createElement("a");
  subtitle.className = "media-card__subtitle";
  subtitle.href = "#";
  subtitle.textContent = playlist.description;
  body.appendChild(subtitle);

  li.appendChild(body);

  return li;
}
