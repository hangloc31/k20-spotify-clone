# K20 Spotify Clone

Clone giao diện Spotify Web Player (`https://open.spotify.com/`) cho mục đích học tập. Dự án tái hiện pixel-faithful giao diện web player với `Vite 8`, `Tailwind CSS v4`, `Vanilla JS` và API `https://spotify.f8team.dev`.

## Bắt đầu nhanh

Yêu cầu `Node.js >= 18`.

```bash
git clone <your-repo-url>
cd k20-spotify-clone
npm install
npm run dev      # chạy dev server với HMR tại http://localhost:5173
npm run build    # build production ra thư mục dist/
npm run preview  # preview bản build
```

## Biến môi trường

Không bắt buộc. Mặc định API là `https://spotify.f8team.dev` (fallback trong `src/services/http.js`).

Nếu muốn đổi API, tạo file `.env` ở thư mục gốc:

```
VITE_API_BASE_URL=https://spotify.f8team.dev
```
