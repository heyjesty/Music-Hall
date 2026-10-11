# 🎵 Music Hall

Live music rooms that anyone can open or walk into. Everyone inside hears the same song at the same moment and chats while they listen.

- **Rooms for everyone.** Any signed-in user can create a room or join one. No music subscription or extra app is needed.
- **In sync.** The server keeps the room's playback state (current song, position, play/pause). Every listener's player follows it and corrects drift, so someone joining mid-song starts at the right spot.
- **A shared queue.** Anyone can search and add songs. If the room is quiet, the song starts right away, and the queue advances on its own when a song ends. The host can play/pause, skip, play something immediately, reorder, remove songs, or close the room.
- **Live chat and presence.** Real-time chat (saved per room), a list of who's listening, and join/leave notices.
- **Mood rooms.** Calm, Party, Energetic, Romantic and Melancholy rooms each suggest trending songs in a matching genre.

### Where the music comes from

| Source | What you get | Needs a key? |
|---|---|---|
| [Audius](https://audius.org) | Full-length tracks from independent artists | No |
| iTunes Search API | 30-second previews of mainstream songs | No |

Tracks are looked up on the server, so clients can only queue real catalogue items, never arbitrary URLs.

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, HTML5 audio |
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
cp .env.example .env
python manage.py migrate
daphne -b 127.0.0.1 -p 8000 core.asgi:application
python manage.py test api                            # run the test suite
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. To try a room with two people, open it in a normal window and a private window, each signed in as a different user.

## Deployment

The frontend and backend deploy separately: Vercel serverless functions can't hold the long-lived WebSocket connections that rooms need.

### Backend → Render

1. In Render, choose **New → Blueprint** and select this repository. `render.yaml` sets up the web service and a Postgres database.
2. Set `FRONTEND_URL` to your Vercel URL.

Room presence and broadcasts run in memory in a single backend process. To run more than one process, set `REDIS_URL`.

### Frontend → Vercel

1. Import the repository in Vercel and set **Root Directory** to `frontend`.
2. Add `NEXT_PUBLIC_BACKEND_URL=https://<your-api>.onrender.com`.
3. Deploy.

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | frontend | Backend base URL |
| `NEXT_PUBLIC_WS_URL` | frontend | Optional WebSocket origin override |
| `DJANGO_DEBUG` | backend | `false` in production |
| `DJANGO_SECRET_KEY` | backend | Required in production |
| `DJANGO_ALLOWED_HOSTS` | backend | Comma-separated hostnames |
| `FRONTEND_URL` | backend | Allowed CORS origin |
| `DATABASE_URL` | backend | Postgres URL (defaults to SQLite) |
| `REDIS_URL` | backend | Optional Redis channel layer |

## API overview

| Endpoint | Who | Description |
|---|---|---|
| `POST /api/users/`, `GET/PATCH /api/users/me/` | | Register, current profile |
| `POST /api/auth/login/`, `POST /api/auth/refresh/` | | JWT auth |
| `GET/POST /api/rooms/`, `DELETE /api/rooms/{id}/` | host deletes | List / create / close rooms |
| `GET /api/rooms/{id}/state/` | anyone | Current song, position and queue |
| `POST /api/rooms/{id}/queue/` | anyone | Add `{source, external_id}` to the queue |
| `POST /api/rooms/{id}/playback/` | host | `{action: play \| pause \| skip}` |
| `POST /api/rooms/{id}/play-now/` | host | Play a song immediately |
| `POST /api/rooms/{id}/queue/{item}/top/`, `DELETE …/queue/{item}/` | host | Reorder / remove |
| `GET /api/music/search/?q=`, `GET /api/music/suggestions/?theme=` | anyone | Find songs |
| `GET /api/messages/?room={id}` | anyone | Recent chat |
| `ws://…/ws/room/{id}/?token={jwt}` | anyone | Live room state, chat, presence |
