"""Who is currently connected to each room.

Kept in process memory, which matches the single-process ASGI deployment in
render.yaml. Running several backend processes would need a shared store
(e.g. Redis) instead.
"""

from collections import defaultdict
from threading import Lock

_lock = Lock()
# room_id -> user_id -> {'username': str, 'connections': int}
_rooms = defaultdict(dict)


def join(room_id, user):
    """Register a connection. Returns True if this is the user's first one in the room."""
    with _lock:
        entry = _rooms[room_id].setdefault(user.id, {'username': user.username, 'connections': 0})
        entry['connections'] += 1
        return entry['connections'] == 1


def leave(room_id, user):
    """Drop a connection. Returns True if the user has no connections left in the room."""
    with _lock:
        room = _rooms.get(room_id, {})
        entry = room.get(user.id)
        if not entry:
            return False
        entry['connections'] -= 1
        if entry['connections'] > 0:
            return False
        del room[user.id]
        if not room:
            _rooms.pop(room_id, None)
        return True


def listeners(room_id):
    with _lock:
        return sorted(
            ({'id': uid, 'username': e['username']} for uid, e in _rooms.get(room_id, {}).items()),
            key=lambda u: u['username'].lower(),
        )


def count(room_id):
    with _lock:
        return len(_rooms.get(room_id, {}))


def clear():
    with _lock:
        _rooms.clear()
