export function Logo({ isLive = false }: { isLive?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        title={isLive ? 'Connected to Live Database' : undefined}
        aria-label={isLive ? 'Connected to Live Database' : undefined}
        aria-hidden={!isLive}
        className={`relative flex size-7 items-center justify-center rounded-lg bg-primary transition-all duration-700 ${
          isLive
            ? 'animate-[pulse_3s_ease-in-out_infinite] shadow-[0_0_14px_rgba(16,185,129,0.75)] ring-1 ring-emerald-400/50'
            : 'shadow-sm shadow-primary/30'
        }`}
      >
        <span className={`absolute h-3.5 w-1 rounded-full bg-primary-foreground ${isLive ? 'animate-pulse' : ''}`} />
        <span className={`absolute h-1 w-3.5 rounded-full bg-primary-foreground ${isLive ? 'animate-pulse' : ''}`} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Cart<span className="text-primary">Cure</span>
      </span>
    </span>
  )
}
