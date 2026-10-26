/** Shown instantly while a signed-in page loads its data, so switching pages never looks frozen. */
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="page-wash px-10 pt-10 pb-8">
        <div className="h-3 w-24 rounded-full bg-primary/20" />
        <div className="mt-3 h-8 w-72 max-w-full rounded-xl bg-muted" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-4 px-10 pb-16 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-card">
            <div className="aspect-[9/14] bg-muted" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-full rounded-full bg-muted" />
              <div className="h-3 w-2/3 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
