export interface LyricLine {
  id: string;
  time: number; // start, in seconds
  end?: number; // end, in seconds (fill finishes here; long pauses don't slow the fill)
  text: string;
  duration?: number;
}

export type FontFamily =
  | 'Onest'
  | 'Unbounded'
  | 'Georgia'
  | 'Mono'
  | 'Inter'
  | 'Outfit'
  | 'Space Grotesk'
  | 'Montserrat'
  | 'Poppins'
  | 'Roboto'
  | 'Playfair Display'
  | 'Bebas Neue'
  | 'Oswald'
  | 'Pacifico';

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
  /** Reference to an uploaded font file (see lib/blob-store). Only set for custom fonts. */
  fontFile?: string;
  textColor: string;        // Inactive text color
  activeColor: string;      // Active highlighted text color
  backgroundType?: BackgroundType;
  backgroundColor: string;  // Base background color
  backgroundGradient?: string;
  backgroundImage?: string;
  fontSize?: FontSize;
  fontSizePx?: number;
  /** Vertical centre of the lyrics block inside the frame, in percent (0-100). */
  textY?: number;
  aspectRatio?: '9:16' | '16:9' | 'v' | 'h';
  coverIcon?: string;
  /** Cover uploaded by the author (data URL or blob ref). */
  coverImage?: string;
}

/** public: in catalog; unlisted: only by link; private: author only */
export type Visibility = 'public' | 'unlisted' | 'private';
export type KaraokeStatus = 'active' | 'blocked' | 'deleted';

export interface Karaoke {
  id: string;
  title: string;
  artist: string;
  description: string;
  tags: string[];
  lyrics: LyricLine[];
  /** Direct URL, or `idb:<id>` for audio uploaded by the author. */
  audioUrl?: string;
  audioPreset?: 'synthwave' | 'lofi' | 'pop' | 'cyberpunk' | 'chill' | 'rock';
  duration: number;         // Total duration in seconds
  style: KaraokeStyle;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  likesCount: number;
  viewsCount: number;
  /** 0-100 recommendation score. Reaching RECOMMEND_THRESHOLD marks it as featured. */
  recommendationScore: number;
  isFeatured?: boolean;
  visibility: Visibility;
  status: KaraokeStatus;
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
  /** Set on replies: id of the top-level review being answered. */
  parentId?: string;
  /** Pinned by the track author or an admin; shown first. */
  pinned?: boolean;
}

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'warned' | 'banned_temp' | 'banned_perm';

export interface UserContacts {
  discord?: string;
  email?: string;
  social?: string;
  showEmail?: boolean;
}

export interface User {
  id: string;
  /** Firebase Auth uid linked to this profile. */
  uid?: string;
  /** Unique tag, lowercase, without "@" (e.g. liza_veter). */
  username: string;
  name: string;
  email: string;
  avatar: string;
  bio?: string;
  contacts?: UserContacts;
  role: UserRole;
  status?: UserStatus;
  warnings?: number;
  banUntil?: string;
  banReason?: string;
  /** Pages whose walkthrough this person has already seen (synced across devices). */
  seenTutorials?: string[];
  createdAt: string;
}

export interface Playlist {
  id: string;
  ownerId: string;
  name: string;
  karaokeIds: string[];
  createdAt: string;
}

export type InteractionType = 'listen' | 'finish' | 'like' | 'playlist' | 'comment' | 'share';

export type SortOption = 'recommended' | 'popular' | 'newest' | 'oldest';

export type NotificationType = 'like' | 'comment' | 'reply' | 'playlist' | 'follow' | 'download' | 'warning' | 'ban';

export interface AppNotification {
  id: string;
  /** Recipient */
  userId: string;
  type: NotificationType;
  actorId?: string;
  actorName?: string;
  karaokeId?: string;
  karaokeTitle?: string;
  /** Review the notification points to (opened via /karaoke/{id}#c-{commentId}). */
  commentId?: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export type StatType = 'listen' | 'follow' | 'download';

/** One finished video download, shown in the downloads panel and in Creator Studio. */
export interface DownloadRecord {
  id: string;
  userId: string;
  karaokeId: string;
  title: string;
  artist: string;
  format: 'reel' | 'landscape' | 'landscape-tv';
  quality?: '480p' | '720p' | '1080p';
  /** Background colour of the project, for the card when the project has no cover. */
  color?: string;
  createdAt: string;
}

/** Daily counter per author, used for the Creator Studio charts. */
export interface DailyStat {
  id: string; // `${authorId}_${type}_${day}`
  authorId: string;
  type: StatType;
  day: string; // YYYY-MM-DD
  count: number;
}
