import DynamicMarker from '@/components/DynamicMarker';
import TagPageClient from './TagPageClient';

/** Server wrapper: the client page plus the marker its URL-based metadata needs (see DynamicMarker). */
export default function TagPage() {
  return (
    <>
      <TagPageClient />
      <DynamicMarker />
    </>
  );
}
