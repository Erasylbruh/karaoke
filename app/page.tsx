import { Suspense } from 'react';
import { Catalog } from '@/components/catalog/Catalog';
import { CatalogSkeleton } from '@/components/catalog/CatalogSkeleton';

export default function HomePage() {
  return (
    <Suspense fallback={<CatalogSkeleton withHero />}>
      <Catalog />
    </Suspense>
  );
}
