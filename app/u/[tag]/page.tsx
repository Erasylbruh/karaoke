import DynamicMarker from '@/components/DynamicMarker';
import ProfilePageClient from './ProfilePageClient';

/** Server wrapper: the client page plus the marker its URL-based metadata needs (see DynamicMarker). */
export default function PublicProfilePage() {
  return (
    <>
      <ProfilePageClient />
      <DynamicMarker />
    </>
  );
}
