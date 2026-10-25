export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-heading text-xl font-bold tracking-tight ${className}`}>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">R</span>
      <span>
        Reel<span className="text-sidebar-primary">y</span>
      </span>
    </span>
  );
}
