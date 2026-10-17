export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="relative flex size-7 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30"
      >
        <span className="absolute h-3.5 w-1 rounded-full bg-primary-foreground" />
        <span className="absolute h-1 w-3.5 rounded-full bg-primary-foreground" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Cart<span className="text-primary">Cure</span>
      </span>
    </span>
  )
}
