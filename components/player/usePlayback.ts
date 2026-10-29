'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { synthPlayer } from '@/lib/audio-synthesizer';
import type { Karaoke } from '@/lib/types';

export interface Playback {
  time: number;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  skip(delta: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
}

const INITIAL_VOLUME = 0.8;
// The synth's own starting gain (see initContext in lib/audio-synthesizer.ts). The synth is shared
// with the exporter and the studio, so the player hands it back at this level.
export const SYNTH_DEFAULT_GAIN = 0.4;
// The synth is loud at full gain; the slider's 1 maps to half of it.
const GAIN_SCALE = 0.5;

/**
 * Playback clock for a track of `duration` seconds with the synth backing track.
 * The clock runs on requestAnimationFrame against `performance.now()`, so `time` updates every frame
 * without drifting. At `duration` it pauses; `play()` from the end starts over.
 */
export function usePlayback({ duration, preset }: { duration: number; preset?: Karaoke['audioPreset'] }): Playback {
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(INITIAL_VOLUME);
  const [muted, setMuted] = useState(false);

  // Handlers read the latest values from refs, so their identity stays stable.
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  // performance.now() at which the track's 0:00 would have been, while playing.
  const originRef = useRef(0);
  const frameRef = useRef(0);
  const levelRef = useRef({ volume: INITIAL_VOLUME, muted: false });

  const applyVolume = useCallback(() => {
    const level = levelRef.current;
    synthPlayer?.setVolume(level.muted ? 0 : level.volume * GAIN_SCALE);
  }, []);

  const startSound = useCallback(
    (from: number) => {
      synthPlayer?.playPreset(preset ?? 'synthwave', from);
      applyVolume();
    },
    [preset, applyVolume],
  );

  const setClock = useCallback((value: number) => {
    timeRef.current = value;
    setTime(value);
  }, []);

  const halt = useCallback(() => {
    playingRef.current = false;
    cancelAnimationFrame(frameRef.current);
    synthPlayer?.stop();
    setIsPlaying(false);
  }, []);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    setClock(Math.min(duration, (performance.now() - originRef.current) / 1000));
    halt();
  }, [duration, halt, setClock]);

  const play = useCallback(() => {
    if (playingRef.current) return;
    const from = timeRef.current >= duration ? 0 : timeRef.current;
    setClock(from);
    originRef.current = performance.now() - from * 1000;
    playingRef.current = true;
    setIsPlaying(true);
    startSound(from);

    const step = () => {
      const now = (performance.now() - originRef.current) / 1000;
      if (now >= duration) {
        setClock(duration);
        halt();
        return;
      }
      setClock(now);
      frameRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);
  }, [duration, halt, setClock, startSound]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback(
    (value: number) => {
      const to = Math.min(duration, Math.max(0, Number.isFinite(value) ? value : 0));
      setClock(to);
      if (playingRef.current) {
        originRef.current = performance.now() - to * 1000;
        startSound(to);
      }
    },
    [duration, setClock, startSound],
  );

  const skip = useCallback(
    (delta: number) => {
      const now = playingRef.current ? (performance.now() - originRef.current) / 1000 : timeRef.current;
      seek(now + delta);
    },
    [seek],
  );

  const setVolume = useCallback(
    (value: number) => {
      const next = Math.min(1, Math.max(0, value));
      // Moving the slider up un-mutes, like in any media player.
      levelRef.current = { volume: next, muted: next > 0 ? false : levelRef.current.muted };
      setVolumeState(next);
      setMuted(levelRef.current.muted);
      applyVolume();
    },
    [applyVolume],
  );

  const toggleMute = useCallback(() => {
    const level = levelRef.current;
    const silent = level.muted || level.volume === 0;
    // Turning the sound on with the slider at zero would stay silent, so it comes back at half volume.
    const next = silent ? { volume: level.volume === 0 ? 0.5 : level.volume, muted: false } : { volume: level.volume, muted: true };
    levelRef.current = next;
    setVolumeState(next.volume);
    setMuted(next.muted);
    applyVolume();
  }, [applyVolume]);

  // Leaving the page stops the clock and the sound and gives the synth back its default gain.
  useEffect(
    () => () => {
      halt();
      synthPlayer?.setVolume(SYNTH_DEFAULT_GAIN);
    },
    [halt],
  );

  return { time, isPlaying, volume, muted, play, pause, toggle, seek, skip, setVolume, toggleMute };
}
