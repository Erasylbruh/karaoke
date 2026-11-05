/**
 * Automatic line timing (speech recognition / forced alignment).
 *
 * Intentionally not wired to a service yet: the provider is chosen when the app is hosted
 * (free speech APIs handle sung vocals and Russian poorly, so the plan is forced alignment of
 * the lyrics the author already typed, e.g. WhisperX on the server).
 * The editor shows the "auto timing" button only when a provider is set.
 */
export interface AlignedLine {
  time: number;
  end: number;
}

export interface AlignmentProvider {
  align(audio: Blob, lines: string[]): Promise<AlignedLine[]>;
}

export const alignmentProvider: AlignmentProvider | null = null;
