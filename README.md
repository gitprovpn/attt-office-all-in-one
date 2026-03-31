# ATTT Project Office - All-in-One Repo

Repo này đã được gom lại thành **một repo duy nhất** để giảm lỗi triển khai:

- **Root repo**: frontend tĩnh để publish bằng **GitHub Pages**
- **/worker**: backend API để deploy lên **Cloudflare Worker**
- **/assets**: ảnh layout pixel office dùng chung

## Cấu trúc

```text
attt-office-all-in-one-repo/
├─ index.html
├─ styles.css
├─ app.js
├─ 404.html
├─ .nojekyll
├─ assets/
│  └─ office-layout.png
├─ worker/
│  ├─ src/
│  │  └─ worker.js
│  ├─ data/
│  │  └─ seed.json
│  ├─ package.json
│  └─ wrangler.jsonc
└─ README.md
```

## Mapping nhân sự

- **Phúc** — ISO 27001 Lead
- **Phú** — VA Coordinator
- **An** — Risk Analyst
- **Thanh** — Pentest Follow-up
- **Tuấn** — Policy & Compliance

## Luồng deploy ngắn gọn

### 1) GitHub
Upload toàn bộ repo này lên **một repo GitHub duy nhất**.

### 2) GitHub Pages
Trong repo:
- Settings
- Pages
- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/(root)`

Vì `index.html` nằm ngay root nên không cần tách thư mục `frontend/` nữa.

### 3) Cloudflare Worker
Trong Cloudflare:
- Workers & Pages
- Create
- Import a repository
- Chọn chính repo này
- **Root directory**: `worker`

### 4) KV binding
Tạo KV namespace rồi bind với tên:
- `OFFICE_KV`

Sau đó cập nhật `worker/wrangler.jsonc` với KV namespace ID thật.

### 5) API_BASE
Sau khi Worker deploy xong, mở file `index.html` và thay:

```html
window.APP_CONFIG = {
  API_BASE: 'https://YOUR-WORKER.your-subdomain.workers.dev'
};
```

bằng URL Worker thật.

## Vì sao bản này ít lỗi hơn

- chỉ còn **1 repo**
- frontend nằm ngay root repo
- GitHub Pages publish trực tiếp từ root
- Cloudflare chỉ cần trỏ `worker` làm root directory
- không còn nhầm giữa repo frontend và repo backend

## Dữ liệu

Dữ liệu seed nằm ở:
- `worker/data/seed.json`

Bạn có thể sửa tay:
- dự án ATTT
- trạng thái từng người
- zone trong văn phòng
- message mô phỏng trao đổi
