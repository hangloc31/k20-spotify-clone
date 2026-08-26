import { httpRequest, baseUrl } from "../services/http.js";

const FALLBACK_IMAGE =
  "https://images.pexels.com/photos/1780838/pexels-photo-1780838.jpeg";

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

function resolveUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}

function extractPath(data) {
  return (
    data?.url ||
    data?.path ||
    data?.cover_url ||
    data?.cover ||
    data?.image_url ||
    data?.file?.url ||
    data?.data?.url ||
    data?.data?.path ||
    data?.data?.cover_url ||
    ""
  );
}

export async function createPlaylist() {
  const data = await httpRequest.post(
    "/api/playlists",
    { name: "My Playlist", description: "", is_public: true, image_url: "" },
    { auth: true },
  );
  const pl = data?.playlist || data?.data || data;
  if (!pl?.id) throw new Error("Không nhận được playlist mới.");
  return pl;
}

async function uploadCover(id, file) {
  const fd = new FormData();
  fd.append("cover", file);
  const data = await httpRequest.post(`/api/upload/playlist/${id}/cover`, fd, {
    auth: true,
  });
  const path = extractPath(data);
  if (!path) throw new Error("Upload ảnh thất bại.");
  return path;
}

async function updatePlaylist(id, patch) {
  await httpRequest.put(`/api/playlists/${id}`, patch, { auth: true });
}

export function enablePlaylistEditing({ id, entity }) {
  const detailView = document.getElementById("detail-view");
  if (!detailView) return;

  const coverEl = detailView.querySelector("[data-playlist-cover]");
  const editEls = detailView.querySelectorAll("[data-playlist-edit]");
  const visibilityBtn = detailView.querySelector("[data-playlist-visibility]");
  const modal = document.getElementById("playlist-edit-modal");
  if (!modal) return;

  const preview = modal.querySelector("[data-playlist-edit-preview]");
  const chooseBtn = modal.querySelector("[data-playlist-edit-choose]");
  const modalFile = modal.querySelector("[data-playlist-edit-file]");
  const nameInput = modal.querySelector("[data-playlist-edit-name]");
  const descInput = modal.querySelector("[data-playlist-edit-desc]");
  const saveBtn = modal.querySelector("[data-playlist-edit-save]");
  const cancelBtn = modal.querySelector("[data-playlist-edit-cancel]");
  const closeBackdrop = modal.querySelector("[data-playlist-edit-close]");

  let isPublic = !!entity.is_public;
  let currentCover = entity.image_url || "";
  let pendingFile = null;

  function refreshDom({ name, description, cover }) {
    const titleEl = detailView.querySelector(".detail-hero__title");
    const metaEl = detailView.querySelector(".detail-hero__meta");
    if (titleEl) titleEl.textContent = name;
    if (description !== undefined && metaEl) {
      const parts = [];
      if (entity.user_display_name) parts.push(`By ${entity.user_display_name}`);
      if (description) parts.push(description);
      metaEl.textContent = parts.join(" · ");
    }
    if (cover) {
      currentCover = cover;
      if (coverEl) coverEl.src = resolveUrl(cover);
      const bg = detailView.querySelector(".detail-hero__bg");
      if (bg) bg.style.backgroundImage = `url('${resolveUrl(cover)}')`;
    }
    if (visibilityBtn) {
      visibilityBtn.textContent = isPublic ? "Make private" : "Make public";
      visibilityBtn.classList.toggle("pill-button--white", !isPublic);
      visibilityBtn.classList.toggle("pill-button--ghost", isPublic);
      visibilityBtn.dataset.isPublic = String(isPublic);
    }
  }

  function openEditModal() {
    pendingFile = null;
    nameInput.value = entity.title || entity.name || "";
    descInput.value = entity.description || "";
    preview.src = resolveUrl(currentCover) || FALLBACK_IMAGE;
    modalFile.value = "";
    modal.removeAttribute("hidden");
    nameInput.focus();
  }

  function closeEditModal() {
    modal.setAttribute("hidden", "");
    pendingFile = null;
  }

  // Cover click -> pick an image (upload directly)
  if (coverEl) {
    const detailFile = document.createElement("input");
    detailFile.type = "file";
    detailFile.accept = "image/*";
    detailFile.hidden = true;
    detailView.appendChild(detailFile);

    coverEl.addEventListener("click", () => detailFile.click());
    detailFile.addEventListener("change", async () => {
      const file = detailFile.files?.[0];
      if (!file) return;
      try {
        const path = await uploadCover(id, file);
        await updatePlaylist(id, { image_url: path });
        refreshDom({ cover: path });
        window.dispatchEvent(new Event("library:refresh"));
        showToast("Đã cập nhật ảnh playlist.");
      } catch (error) {
        showToast(error.message || "Không thể cập nhật ảnh.");
      } finally {
        detailFile.value = "";
      }
    });
  }

  // Name / Edit button -> modal
  editEls.forEach((el) =>
    el.addEventListener("click", () => openEditModal()),
  );

  // Make public / Make private
  visibilityBtn?.addEventListener("click", async () => {
    try {
      isPublic = !isPublic;
      await updatePlaylist(id, { is_public: isPublic });
      refreshDom({});
      window.dispatchEvent(new Event("library:refresh"));
      showToast(isPublic ? "Playlist đã công khai." : "Playlist đã chuyển chế độ riêng tư.");
    } catch (error) {
      isPublic = !isPublic;
      showToast(error.message || "Không thể thay đổi trạng thái.");
    }
  });

  // Modal interactions
  chooseBtn?.addEventListener("click", () => modalFile.click());
  modalFile?.addEventListener("change", () => {
    const file = modalFile.files?.[0];
    if (!file) return;
    pendingFile = file;
    preview.src = URL.createObjectURL(file);
  });

  saveBtn?.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("Tên playlist không được để trống.");
      return;
    }
    const description = descInput.value.trim();
    saveBtn.disabled = true;
    try {
      let imageUrl = currentCover;
      if (pendingFile) {
        imageUrl = await uploadCover(id, pendingFile);
      }
      await updatePlaylist(id, { name, description, image_url: imageUrl });
      entity.title = name;
      entity.description = description;
      entity.image_url = imageUrl;
      refreshDom({ name, description, cover: imageUrl });
      window.dispatchEvent(new Event("library:refresh"));
      showToast("Đã lưu thông tin playlist.");
      closeEditModal();
    } catch (error) {
      showToast(error.message || "Không thể lưu thông tin.");
    } finally {
      saveBtn.disabled = false;
    }
  });

  cancelBtn?.addEventListener("click", closeEditModal);
  closeBackdrop?.addEventListener("click", closeEditModal);
}