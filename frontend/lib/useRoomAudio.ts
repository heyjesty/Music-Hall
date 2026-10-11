"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState } from './types';

const DRIFT_TOLERANCE_S = 2;
const SYNC_INTERVAL_MS = 3000;
const VOLUME_KEY = 'musichall:volume';

interface Options {
  /** Called once per track when this client sees it finish. */
  onTrackEnded: (playSeq: number) => void;
}

function readVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.8;
  } catch {
    return 0.8;
  }
}

/**
 * Plays the room's current track in step with the server.
 *
 * The server says "track X, at position P, playing/paused" and we keep a local
 * <audio> element within a couple of seconds of that. Browsers block audio
 * until the user interacts with the page, so `needsUnlock` tells the UI to show
 * a "Start listening" button.
 */
export function useRoomAudio(state: RoomState | null, { onTrackEnded }: Options) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef<{ state: RoomState; receivedAt: number } | null>(null);
  const loadedSeqRef = useRef<number | null>(null);
  const endedSeqRef = useRef<number | null>(null);
  const unlockedRef = useRef(false);
  const onEndedRef = useRef(onTrackEnded);
  useEffect(() => {
    onEndedRef.current = onTrackEnded;
  }, [onTrackEnded]);

  const [unlocked, setUnlocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [errorSeq, setErrorSeq] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(readVolume);
  const [positionMs, setPositionMs] = useState(0);

  const expectedPosition = useCallback(() => {
    const s = stateRef.current;
    if (!s?.state.current) return 0;
    const elapsed = s.state.is_playing ? Date.now() - s.receivedAt : 0;
    return Math.min(s.state.position_ms + elapsed, s.state.current.duration);
  }, []);

  const reportEnded = useCallback((seq: number) => {
    if (endedSeqRef.current === seq) return;
    endedSeqRef.current = seq;
    onEndedRef.current(seq);
  }, []);

  const sync = useCallback(() => {
    const audio = audioRef.current;
    const s = stateRef.current?.state;
    if (!audio) return;

    if (!s?.current) {
      audio.pause();
      if (audio.getAttribute('src')) {
        audio.removeAttribute('src');
        audio.load();
      }
      loadedSeqRef.current = null;
      return;
    }

    const target = expectedPosition() / 1000;
    if (loadedSeqRef.current !== s.play_seq) {
      loadedSeqRef.current = s.play_seq;
      audio.src = s.current.stream_url;
      audio.currentTime = target;
    } else if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > DRIFT_TOLERANCE_S) {
      audio.currentTime = target;
    }

    if (s.is_playing && unlockedRef.current) {
      if (audio.paused) {
        audio.play().then(
          () => setBlocked(false),
          (err: DOMException) => {
            if (err.name === 'NotAllowedError') setBlocked(true);
          },
        );
      }
    } else if (!audio.paused) {
      audio.pause();
    }
  }, [expectedPosition]);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = readVolume();
    audioRef.current = audio;

    const onEnded = () => {
      const s = stateRef.current?.state;
      if (s && loadedSeqRef.current === s.play_seq) reportEnded(s.play_seq);
    };
    const onError = () => {
      if (audio.getAttribute('src') && loadedSeqRef.current !== null) setErrorSeq(loadedSeqRef.current);
    };
    const onMeta = () => {
      const target = expectedPosition() / 1000;
      if (Math.abs(audio.currentTime - target) > DRIFT_TOLERANCE_S) audio.currentTime = target;
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('loadedmetadata', onMeta);

    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [expectedPosition, reportEnded]);

  // Apply each new server state.
  useEffect(() => {
    stateRef.current = state ? { state, receivedAt: Date.now() } : null;
    sync();
  }, [state, sync]);

  // Periodic drift correction, progress updates and end detection (also works
  // for listeners who haven't pressed "Start listening").
  useEffect(() => {
    const tick = () => {
      const s = stateRef.current?.state;
      const pos = expectedPosition();
      setPositionMs(pos);
      if (s?.current && s.is_playing && pos >= s.current.duration + 1500) reportEnded(s.play_seq);
    };
    tick();
    const progress = setInterval(tick, 500);
    const drift = setInterval(sync, SYNC_INTERVAL_MS);
    return () => {
      clearInterval(progress);
      clearInterval(drift);
    };
  }, [expectedPosition, reportEnded, sync]);

  // Lock-screen / media-key metadata.
  const track = state?.current ?? null;
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: 'Music Hall',
          artwork: track.album_art ? [{ src: track.album_art, sizes: '480x480' }] : [],
        })
      : null;
  }, [track]);

  /** Must be called from a click handler so the browser allows playback. */
  const unlock = useCallback(() => {
    unlockedRef.current = true;
    setUnlocked(true);
    setBlocked(false);
    const audio = audioRef.current;
    const s = stateRef.current?.state;
    if (!audio || !s?.current) return;
    sync();
    if (s.is_playing) audio.play().catch(() => setBlocked(true));
  }, [sync]);

  const setVolume = useCallback((value: number) => {
    const v = Math.min(1, Math.max(0, value));
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // Not persisted; fine.
    }
  }, []);

  return {
    positionMs,
    listening: unlocked && !blocked,
    needsUnlock: !unlocked || blocked,
    loadError: state !== null && errorSeq === state.play_seq,
    volume,
    setVolume,
    unlock,
  };
}
