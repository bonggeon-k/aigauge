export const SkeletonCard = () => {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm">
      <div className="skeleton-shimmer mb-3 h-4 w-1/3 rounded" />
      <div className="skeleton-shimmer mb-4 h-3 w-2/3 rounded" />
      <div className="skeleton-shimmer mb-3 h-2 w-full rounded" />
      <div className="grid grid-cols-2 gap-2">
        <div className="skeleton-shimmer h-8 rounded" />
        <div className="skeleton-shimmer h-8 rounded" />
      </div>
    </div>
  );
};
