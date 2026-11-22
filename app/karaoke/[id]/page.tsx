import DynamicMarker from '@/components/DynamicMarker';
import KaraokePageClient from './KaraokePageClient';

/** Server wrapper: the client page plus the marker its URL-based metadata needs (see DynamicMarker). */
export default function KaraokePage() {
  return (
    <>
      <KaraokePageClient />
      <DynamicMarker />
    </>
  );
}
