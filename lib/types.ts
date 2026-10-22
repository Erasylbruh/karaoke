export interface LyricLine {
  id: string;
  time: number; // in seconds
  text: string;
  duration?: number;
}

export type FontFamily = 
  | 'Inter'
  | 'Poppins'
  | 'Montserrat'
  | 'Space Grotesk'
  | 'Outfit'
  | 'Caveat'
  | 'Playfair Display'
  | 'JetBrains Mono';

export type BackgroundType = 
  | 'mesh'
  | 'obsidian'
  | 'gradient'
  | 'aura'
  | 'particles'
  | 'custom';

export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

export interface KaraokeStyle {
  font: FontFamily;
  textColor: string;        // Inactive text color
  activeColor: string;      // Active highlighted text color
  backgroundType: BackgroundType;
  backgroundColor: string;  // Base background color
  backgroundGradient?: string; // Optional gradient / mesh colors
  backgroundImage?: string; // Custom uploaded image URL
  fontSize: FontSize;
  coverIcon: string;        // Emoji or icon name (e.g. 'mic', 'disc', 'flame', 'sparkles', 'headphones')
  coverImage?: string;      // Custom cover image URL
}

export interface Karaoke {
  id: string;
  title: string;
  artist: string;
  description: string;
  tags: string[];
  lyrics: LyricLine[];
  audioUrl?: string;        // Audio file URL or synthesizer preset ID
  audioPreset?: 'synthwave' | 'lofi' | 'pop' | 'cyberpunk' | 'chill' | 'rock';
  duration: number;         // Total duration in seconds
  style: KaraokeStyle;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  likesCount: number;
  viewsCount: number;
  isFeatured: boolean;
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

export type SortOption = 'newest' | 'oldest' | 'popular' | 'recommended';
