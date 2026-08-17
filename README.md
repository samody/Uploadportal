# Uploadportal

A secure file drop and share portal with an admin dashboard. Create time-limited upload links for receiving files and shareable download links for distributing them — all behind unique access codes.

## Features

- **Upload Links** — Generate unique codes that let anyone upload files. Optionally set file count limits and expiration times.
- **Share Links** — Create download links for specific files with expiration and download tracking.
- **Admin Dashboard** — Password-protected portal to manage upload links, files, and share links.
- **Code-Based Access** — Public users enter a short alphanumeric code to upload or download, no account required.
- **Drag & Drop Uploads** — Multiple file upload with progress tracking (up to 20 files at once).
- **SQLite Storage** — Embedded database with no external dependencies.

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3
- **Frontend:** Vanilla HTML/CSS/JS
- **Database:** SQLite (WAL mode)
- **Auth:** bcryptjs (admin password hashing), UUID session tokens

## Getting Started

### Prerequisites

- Node.js 12+

### Installation

```bash
git clone <repo-url>
cd Uploadportal
npm install
```

### Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `ADMIN_PASSWORD` | `changeme` | Admin login password — **change before deploying** |
| `MAX_FILE_SIZE_MB` | `100` | Maximum file size per upload (MB) |

### Running

```bash
# Development (auto-reload on changes)
npm run dev

# Production
npm start
```

The server starts at `http://localhost:3001`.

## Usage

### Admin Portal

Go to `http://localhost:3001/admin` and log in with your configured password. The public
landing page does not link here — navigate to `/admin` directly.

From the dashboard you can:

- Create upload links (with optional labels, file limits, and expiration)
- Upload files directly, without going through an upload link
- Browse, download, and delete uploaded files
- Create share links for any uploaded file
- Revoke a link (disable it, keep its history) or delete it outright
- Copy any code or link to the clipboard
- Track download counts

### Uploading Files

1. Create an upload link in the admin portal
2. Share the code or URL with the uploader
3. They visit the portal, enter the code, and drag/drop files

### Sharing Files

1. Select a file in the admin portal and create a share link
2. Share the code or URL with the recipient
3. They visit the portal, enter the code, and download the file

## Project Structure

```
├── server.js          # Express server and API routes
├── db.js              # SQLite schema and initialization
├── .env.example       # Environment variable template
└── public/
    ├── index.html     # Main portal (code entry)
    ├── upload.html    # Upload interface
    ├── share.html     # Download interface
    ├── admin.html     # Admin dashboard
    └── style.css      # Global styles
```

`uploads/` and `data/` directories are created automatically at runtime for file storage and the SQLite database.

## API

### Public

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/resolve-code?code=` | Determine if a code is for upload or share |
| GET | `/api/upload/verify?token=&code=` | Validate an upload link |
| POST | `/api/upload?token=&code=` | Upload files (multipart) |
| GET | `/api/share/verify?token=&code=` | Validate a share link |
| GET | `/api/share/download?token=&code=` | Download a shared file |

### Admin (requires `x-session-id` header)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/login` | Authenticate |
| POST | `/api/admin/logout` | End session |
| GET | `/api/admin/upload-links` | List upload links |
| POST | `/api/admin/upload-links` | Create upload link |
| POST | `/api/admin/upload-links/:id/revoke` | Disable link, keep the row and its history |
| DELETE | `/api/admin/upload-links/:id` | Delete link row (uploaded files are kept) |
| GET | `/api/admin/files` | List files |
| POST | `/api/admin/files` | Upload files directly (multipart, no upload link) |
| GET | `/api/admin/files/:id/download` | Download a file |
| DELETE | `/api/admin/files/:id` | Delete file (its share links cascade) |
| GET | `/api/admin/share-links` | List share links |
| POST | `/api/admin/share-links` | Create share link |
| POST | `/api/admin/share-links/:id/revoke` | Disable link, keep the row and its count |
| DELETE | `/api/admin/share-links/:id` | Delete link row (the file is kept) |

**Revoke vs. delete.** Revoking sets `active=0` — the code stops working but the row and its
counts remain visible. Deleting removes the row outright. Deleting an upload link does *not*
delete the files uploaded through it; they simply lose their link association
(`files.upload_link_id` is `ON DELETE SET NULL`). Deleting a *file*, by contrast, cascades to
the share links pointing at it.

> Admin file downloads authenticate via the `x-session-id` header, which a plain link
> navigation cannot send. Clients must fetch the endpoint with the header and save the
> response body rather than pointing an `<a href>` at it.

## License

ISC
