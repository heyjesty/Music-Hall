# 🎵 Music Hall

Social, synchronized listening rooms. Create a room, queue tracks from Spotify, and listen in sync with friends — with live chat built in.

- **Synced playback** — the room host drives playback; every listener's Spotify player follows (track, position, play/pause) with drift correction.
- **Shared queue** — anyone in the room can search Spotify and add tracks; the host can reorder, remove, and skip.
- **Live chat** — real-time over WebSockets, persisted per room.
- **Mood rooms** — Calm, Party, Energetic, Romantic and Melancholy rooms come with matching track suggestions.

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Spotify Web Playback SDK |
| Backend  | Django, Django REST Framework, SimpleJWT, Django Channels (ASGI / Daphne) |
| Data     | SQLite locally, Postgres in production; optional Redis channel layer |

```
Music-Hall/
├── frontend/   # Next.js app (deployed to Vercel)
├── backend/    # Django + Channels API (deployed to Render or any ASGI host)
└── render.yaml # Render blueprint for the backend + Postgres
```

## Local development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                 # add your Spotify credentials
python manage.py migrate
daphne -b 127.0.0.1 -p 8000 core.asgi:application    # or: python manage.py runserver
python manage.py test api                            # run the test suite
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

### Spotify setup

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add a Redirect URI that points at the backend callback, e.g. `http://127.0.0.1:8000/api/spotify/callback/` (and your production URL later).
3. Put the client ID / secret / redirect URI in `backend/.env`.

Without Spotify credentials the app still runs — search returns demo tracks. In-browser playback requires **Spotify Premium**, and while your Spotify app is in development mode only users you add to its allowlist can connect.

## Deployment

The frontend and backend deploy separately: Vercel serverless functions can't hold the long-lived WebSocket connections the backend needs.

### Backend → Render

1. In Render: **New → Blueprint**, select this repository. `render.yaml` provisions the web service and a Postgres database.
2. Set `FRONTEND_URL` (your Vercel URL), `SPOTIPY_CLIENT_ID`, `SPOTIPY_CLIENT_SECRET`, and `SPOTIPY_REDIRECT_URI` (`https://<your-api>.onrender.com/api/spotify/callback/`).
3. Add that redirect URI to your Spotify app.

To run more than one backend process, also set `REDIS_URL` so WebSocket broadcasts reach every process.

### Frontend → Vercel

1. Import the repository in Vercel and set **Root Directory** to `frontend`.
2. Add the environment variable `NEXT_PUBLIC_BACKEND_URL=https://<your-api>.onrender.com`.
3. Deploy.

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | frontend | Backend base URL |
| `NEXT_PUBLIC_WS_URL` | frontend | Optional WebSocket origin override |
| `DJANGO_DEBUG` | backend | `false` in production |
| `DJANGO_SECRET_KEY` | backend | Required in production |
| `DJANGO_ALLOWED_HOSTS` | backend | Comma-separated hostnames |
| `FRONTEND_URL` | backend | Used for CORS and the Spotify redirect back to the app |
| `DATABASE_URL` | backend | Postgres URL (defaults to SQLite) |
| `REDIS_URL` | backend | Optional Redis channel layer |
| `SPOTIPY_CLIENT_ID` / `SPOTIPY_CLIENT_SECRET` / `SPOTIPY_REDIRECT_URI` | backend | Spotify app credentials |

## API overview

| Endpoint | Description |
|---|---|
| `POST /api/users/`, `GET/PATCH /api/users/me/` | Register, current profile |
| `POST /api/auth/login/`, `POST /api/auth/refresh/` | JWT auth |
| `/api/rooms/`, `POST /api/rooms/{id}/join/` | Rooms (only the host can edit or delete) |
| `/api/playlists/?room={id}`, `POST /api/playlists/{id}/move_to_top/` | Room queue |
| `GET /api/messages/?room={id}` | Recent chat history |
| `/api/spotify/{login,callback,refresh,search,mood-tracks,play,transfer}/` | Spotify integration |
| `ws://…/ws/room/{id}/?token={jwt}` | Real-time chat, presence, playback sync |
