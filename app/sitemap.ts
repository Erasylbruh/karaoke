import type { MetadataRoute } from 'next';
import { fetchCatalogForSeo, SITE_URL } from '@/lib/server-meta';

function slugifySeo(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { tracks, usernames } = await fetchCatalogForSeo();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/create`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/copyright`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  const trackRoutes: MetadataRoute.Sitemap = tracks.map((t) => ({
    url: `${SITE_URL}/karaoke/${encodeURIComponent(t.id)}`,
    lastModified: t.createdAt ? new Date(t.createdAt) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const artists = [...new Set(tracks.map((t) => slugifySeo(t.artist)).filter(Boolean))];
  const artistRoutes: MetadataRoute.Sitemap = artists.map((slug) => ({
    url: `${SITE_URL}/artist/${encodeURIComponent(slug)}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const tags = [...new Set(tracks.flatMap((t) => t.tags.map((g) => g.toLowerCase())).filter(Boolean))];
  const tagRoutes: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${SITE_URL}/tag/${encodeURIComponent(tag)}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const userRoutes: MetadataRoute.Sitemap = usernames.map((u) => ({
    url: `${SITE_URL}/u/${encodeURIComponent(u)}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...trackRoutes, ...artistRoutes, ...tagRoutes, ...userRoutes];
}
