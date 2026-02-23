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
| `PORT` | `3000` | Server port |
| `ADMIN_PASSWORD` | `changeme` | Admin login password — **change before deploying** |
| `MAX_FILE_SIZE_MB` | `100` | Maximum file size per upload (MB) |

### Running

```bash
# Development (auto-reload on changes)
npm run dev

# Production
npm start
```

The server starts at `http://localhost:3000`.

## Usage

### Admin Portal

Go to `http://localhost:3000/admin` and log in with your configured password.

From the dashboard you can:

- Create upload links (with optional labels, file limits, and expiration)
- Browse and delete uploaded files
- Create share links for any uploaded file
- Revoke any active link
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
| DELETE | `/api/admin/upload-links/:id` | Revoke upload link |
| GET | `/api/admin/files` | List files |
| DELETE | `/api/admin/files/:id` | Delete file |
| GET | `/api/admin/share-links` | List share links |
| POST | `/api/admin/share-links` | Create share link |
| DELETE | `/api/admin/share-links/:id` | Revoke share link |

## License

ISC
