'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Repeat, 
  Music,
  Flame,
  Disc,
  Headphones,
  Mic2
} from 'lucide-react';
import { Karaoke } from '@/lib/types';
import { synthPlayer } from '@/lib/audio-synthesizer';

interface SpotifyLyricsEngineProps {
  karaoke: Karaoke;
  autoPlay?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  isCompact?: boolean;
}

export default function SpotifyLyricsEngine({
  karaoke,
  autoPlay = false,
  onTimeUpdate,
  isCompact = false,
}: SpotifyLyricsEngineProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lyricsListRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const { style, lyrics, duration } = karaoke;

  // Determine current active lyric index
  const activeIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;
    let index = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        index = i;
      } else {
        break;
      }
    }
    return index;
  }, [lyrics, currentTime]);

  // Audio Playback management
  useEffect(() => {
    if (karaoke.audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(karaoke.audioUrl);
      }
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.loop = isLooping;

      const handleTime = () => {
        if (audioRef.current) {
          const t = audioRef.current.currentTime;
          setCurrentTime(t);
          onTimeUpdate?.(t);
        }
      };

      const handleEnded = () => {
        if (!isLooping) {
          setIsPlaying(false);
          setCurrentTime(0);
        }
      };

      audioRef.current.addEventListener('timeupdate', handleTime);
      audioRef.current.addEventListener('ended', handleEnded);

      return () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener('timeupdate', handleTime);
          audioRef.current.removeEventListener('ended', handleEnded);
          audioRef.current.pause();
        }
      };
    } else {
      let lastTimestamp = performance.now();

      const updateLoop = (now: number) => {
        if (isPlaying) {
          const delta = (now - lastTimestamp) / 1000;
          lastTimestamp = now;

          setCurrentTime((prev) => {
            const next = prev + delta * playbackRate;
            if (next >= duration) {
              if (isLooping) {
                synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', 0);
                return 0;
              } else {
                setIsPlaying(false);
                synthPlayer?.stop();
                return duration;
              }
            }
            onTimeUpdate?.(next);
            return next;
          });
        } else {
          lastTimestamp = now;
        }
        animationFrameRef.current = requestAnimationFrame(updateLoop);
      };

      animationFrameRef.current = requestAnimationFrame(updateLoop);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [karaoke.audioUrl, karaoke.audioPreset, duration, isPlaying, playbackRate, isLooping, onTimeUpdate, isMuted, volume]);

  useEffect(() => {
    if (karaoke.audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      } else {
        audioRef.current.pause();
      }
    } else if (!karaoke.audioUrl && synthPlayer) {
      if (isPlaying) {
        synthPlayer.setVolume(isMuted ? 0 : volume);
        synthPlayer.playPreset(karaoke.audioPreset || 'synthwave', currentTime);
      } else {
        synthPlayer.stop();
      }
    }
  }, [isPlaying, karaoke.audioUrl, karaoke.audioPreset]);

  // Smooth scroll active line into center
  useEffect(() => {
    if (activeLineRef.current && lyricsListRef.current) {
      const container = lyricsListRef.current;
      const activeEl = activeLineRef.current;

      const containerHeight = container.clientHeight;
      const activeElTop = activeEl.offsetTop;
      const activeElHeight = activeEl.clientHeight;

      const targetScroll = activeElTop - containerHeight / 2 + activeElHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeIndex]);

  const togglePlay = () => {
    if (!isPlaying && currentTime >= duration) {
      handleSeek(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (newTime: number) => {
    const clamped = Math.max(0, Math.min(duration, newTime));
    setCurrentTime(clamped);
    onTimeUpdate?.(clamped);

    if (karaoke.audioUrl && audioRef.current) {
      audioRef.current.currentTime = clamped;
    } else if (!karaoke.audioUrl && synthPlayer && isPlaying) {
      synthPlayer.playPreset(karaoke.audioPreset || 'synthwave', clamped);
    }
  };

  const handleLineClick = (lineTime: number) => {
    handleSeek(lineTime);
    if (!isPlaying) {
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (karaoke.audioUrl && audioRef.current) {
      audioRef.current.volume = newVol;
    } else if (synthPlayer) {
      synthPlayer.setVolume(newVol);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      handleVolumeChange(volume || 0.8);
    } else {
      setIsMuted(true);
      if (karaoke.audioUrl && audioRef.current) {
        audioRef.current.volume = 0;
      } else if (synthPlayer) {
        synthPlayer.setVolume(0);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const fontClass = {
    'Inter': 'font-sans',
    'Poppins': 'font-sans font-medium',
    'Montserrat': 'font-sans tracking-tight',
    'Space Grotesk': 'font-mono tracking-tight',
    'Outfit': 'font-sans',
    'Caveat': 'font-serif italic',
    'Playfair Display': 'font-serif',
    'JetBrains Mono': 'font-mono',
  }[style?.font as string] || 'font-sans';

  const fontSizeClass = (style?.fontSize && typeof style.fontSize === 'string' && {
    sm: 'text-lg sm:text-xl md:text-2xl',
    md: 'text-xl sm:text-2xl md:text-3xl',
    lg: 'text-2xl sm:text-3xl md:text-4xl',
    xl: 'text-3xl sm:text-4xl md:text-5xl',
  }[style.fontSize]) || 'text-2xl sm:text-3xl';

  const renderIcon = () => {
    switch (style.coverIcon) {
      case 'flame': return <Flame className="w-5 h-5 text-zinc-400" />;
      case 'disc': return <Disc className="w-5 h-5 text-zinc-400" />;
      case 'headphones': return <Headphones className="w-5 h-5 text-zinc-400" />;
      default: return <Mic2 className="w-5 h-5 text-green-500" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-xl overflow-hidden transition-all flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen w-screen' : isCompact ? 'h-[440px]' : 'h-[600px] md:h-[640px]'
      } border border-zinc-800 bg-zinc-950`}
    >
      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3.5 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center">
            {style.coverImage ? (
              <img src={style.coverImage} alt={karaoke.title} className="w-full h-full object-cover" />
            ) : (
              renderIcon()
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-zinc-100 truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {karaoke.title}
            </h3>
            <p className="text-xs text-zinc-400">
              {karaoke.artist}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800">
            <span 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isPlaying ? '#22c55e' : '#71717a' }}
            />
            {isPlaying ? 'Играет' : 'Пауза'}
          </span>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors border border-zinc-800"
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Spotify Lyrics Viewport */}
      <div
        ref={lyricsListRef}
        className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-12 md:px-16 py-20 scroll-smooth space-y-6 focus:outline-none bg-zinc-950"
      >
        {lyrics.map((line, idx) => {
          const isActive = idx === activeIndex;

          return (
            <div
              key={line.id}
              ref={isActive ? activeLineRef : null}
              onClick={() => handleLineClick(line.time)}
              className={`cursor-pointer transition-colors duration-200 select-none py-1 group ${fontClass} ${fontSizeClass} ${
                isActive 
                  ? 'font-bold opacity-100'
                  : 'font-normal opacity-40 hover:opacity-80'
              }`}
              style={{
                color: isActive ? (style.activeColor || '#22c55e') : (style.textColor || '#a1a1aa'),
                textShadow: 'none',
              }}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-[11px] font-mono tracking-wider opacity-0 group-hover:opacity-60 transition-opacity text-zinc-500">
                  {formatTime(line.time)}
                </span>
                <span className="leading-snug">
                  {line.text}
                </span>
              </div>
            </div>
          );
        })}
        <div className="h-40" />
      </div>

      {/* Watermark in bottom corner */}
      <div className="absolute bottom-20 right-6 z-20 pointer-events-none hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-medium text-zinc-500">
        KaraokeCraft
      </div>

      {/* Bottom Controls */}
      <div className="relative z-30 p-4 bg-zinc-950 border-t border-zinc-800">
        
        {/* Progress Bar & Time */}
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-xs font-mono text-zinc-500 w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <div 
            className="relative flex-1 h-1.5 bg-zinc-800 rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              handleSeek(pos * duration);
            }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{
                width: `${Math.min(100, (currentTime / (duration || 1)) * 100)}%`,
                backgroundColor: style.activeColor || '#22c55e',
              }}
            />
          </div>
          <span className="text-xs font-mono text-zinc-500 w-10">
            {formatTime(duration)}
          </span>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          
          {/* Left tools: Loop & Speed */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1.5 rounded-lg transition-colors ${
                isLooping ? 'bg-zinc-800 text-green-400' : 'text-zinc-500 hover:text-zinc-200'
              }`}
              title={isLooping ? 'Повтор включен' : 'Включить повтор'}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                const nextRate = playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 0.75 : 1;
                setPlaybackRate(nextRate);
              }}
              className="px-2 py-0.5 text-xs font-mono font-medium rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-800"
              title="Скорость воспроизведения"
            >
              {playbackRate}x
            </button>
          </div>

          {/* Center: Play / Pause & Restart */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSeek(0)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Начать сначала"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-400 text-black flex items-center justify-center transition-colors"
              title={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
            </button>
          </div>

          {/* Right: Volume Slider */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 sm:w-20 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-green-500"
            />
          </div>

        </div>

      </div>

    </div>
  );
}
