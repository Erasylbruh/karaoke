export interface LyricLine {
  id: string;
  time: number; // in seconds
  text: string;
  duration?: number;
}

export type FontFamily = 
  | 'Onest'
  | 'Unbounded'
  | 'Georgia'
  | 'Mono'
  | 'Inter'
  | 'Poppins'
  | 'Montserrat'
  | 'Space Grotesk'
  | 'Outfit';

export type BackgroundType = 
  | 'mesh'
  | 'obsidian'
  | 'gradient'
  | 'aura'
  | 'particles'
  | 'custom';

export type FontSize = 'sm' | 'md' | 'lg' | 'xl' | number;

export interface KaraokeStyle {
  font: FontFamily | string;
  textColor: string;        // Inactive text color
  activeColor: string;      // Active highlighted text color
  backgroundType?: BackgroundType;
  backgroundColor: string;  // Base background color
  backgroundGradient?: string; // Optional gradient / mesh colors
  backgroundImage?: string; // Custom uploaded image URL
  fontSize?: FontSize;
  fontSizePx?: number;
  aspectRatio?: '9:16' | '16:9' | 'v' | 'h';
  coverIcon?: string;
  coverImage?: string;
}

export interface Karaoke {
  id: string;
  title: string;
  artist: string;
  description: string;
  tags: string[];
  lyrics: LyricLine[];
  audioUrl?: string;
  audioPreset?: 'synthwave' | 'lofi' | 'pop' | 'cyberpunk' | 'chill' | 'rock';
  duration: number;         // Total duration in seconds
  style: KaraokeStyle;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  likesCount: number;
  viewsCount: number;
  recommendationScore?: number;
  isFeatured?: boolean;
  createdAt: string;        // ISO date string
}

export interface Comment {
  id: string;
  karaokeId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
}

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  bio?: string;
  role: UserRole;
  createdAt: string;
}

export type SortOption = 'recommended' | 'popular' | 'newest' | 'oldest';
