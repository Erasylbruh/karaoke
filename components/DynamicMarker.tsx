import { Suspense } from 'react';
import { connection } from 'next/server';

async function Connection() {
  await connection();
  return null;
}

/**
 * Marks a route whose `generateMetadata` reads the URL (params) as rendered at request time on
 * purpose. With Cache Components, Next.js otherwise reports "URL data in generateMetadata()" for
 * routes that are prerenderable apart from their metadata. It has to be rendered by the route's
 * page (a layout does not count), so a client page gets a small server `page.tsx` wrapper that
 * renders it plus this marker. Never await `connection()` directly in the page or layout body:
 * that would drop the static shell.
 * See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md.
 */
export default function DynamicMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  );
}
