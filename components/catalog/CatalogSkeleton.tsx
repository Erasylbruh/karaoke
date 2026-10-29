import { Skeleton } from '@/components/ui/skeleton';

/** Grid of the catalog; the same classes for the real cards and the placeholders. */
export const CATALOG_GRID = 'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

/** First-screen columns: text on the left, showcase on the right from `lg`. */
export const CATALOG_HERO = 'wrap grid gap-8 pt-8 pb-10 sm:pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-12 lg:pt-16 lg:pb-14';

/** Heading and lead of the catalog. Static, so the loading state shows the real text. */
export function CatalogIntro() {
  return (
    <>
      <h1 className="font-display text-[clamp(32px,5vw,56px)] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-fg">
        Покажите песню так, как вы её слышите
      </h1>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-fg-muted sm:text-[17px]">
        Загрузите трек, расставьте строки по времени и опубликуйте караоке со своим шрифтом и цветами.
      </p>
    </>
  );
}

export function TrackCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3.5 w-1/2" />
      <Skeleton className="mt-2.5 h-3 w-2/5" />
    </div>
  );
}

/** Five pill placeholders for the tag chips; put them in the chips row. */
export function TagChipsSkeleton() {
  return ['w-16', 'w-22', 'w-18', 'w-24', 'w-15'].map((width) => (
    <Skeleton key={width} className={`h-9 shrink-0 rounded-full ${width}`} />
  ));
}

export function ShowcaseSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[16/10] rounded-3xl lg:aspect-square" />
      <Skeleton className="mt-3 h-4 w-2/3" />
    </div>
  );
}

/** Eight placeholder cards; `withHero` adds the first screen and the toolbar, for the page's Suspense fallback. */
export function CatalogSkeleton({ withHero = false }: { withHero?: boolean }) {
  const grid = (
    <div className={CATALOG_GRID} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <TrackCardSkeleton key={index} />
      ))}
    </div>
  );
  if (!withHero) return grid;

  return (
    <div aria-busy="true">
      <section className={CATALOG_HERO}>
        <div>
          <CatalogIntro />
          <Skeleton className="mt-8 h-12 rounded-full" />
          <div className="mt-4 flex gap-2 overflow-hidden">
            <TagChipsSkeleton />
          </div>
        </div>
        <ShowcaseSkeleton />
      </section>
      <div className="wrap pb-16 sm:pb-24">
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-[42px] w-[340px] max-w-full rounded-full" />
          <Skeleton className="ml-auto h-4 w-16 max-sm:hidden" />
        </div>
        {grid}
      </div>
    </div>
  );
}
