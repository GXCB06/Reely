/** Same shape as a research page (brief, Reely's reply, summary tiles, top 10) so nothing jumps when it loads. */
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="mx-auto max-w-3xl space-y-6 px-6 pt-8 pb-6">
        <div className="ml-auto h-16 w-2/3 rounded-3xl rounded-br-md bg-primary/15" />
        <div className="flex gap-3">
          <div className="size-8 shrink-0 rounded-full bg-primary/25" />
          <div className="h-28 flex-1 rounded-3xl rounded-tl-md bg-muted" />
        </div>
      </div>
      <div className="space-y-8 px-4 md:px-10 pb-16">
        <div className="rounded-3xl border bg-card p-6">
          <div className="h-8 w-3/4 max-w-xl rounded-xl bg-muted" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
    </div>
  );
}
