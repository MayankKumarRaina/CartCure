export function Logo({ isLive = false }: { isLive?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        title={isLive ? 'Connected to Live Database' : undefined}
        aria-label={isLive ? 'Connected to Live Database' : undefined}
        aria-hidden={!isLive}
        className={`shrink-0 transition-all duration-700 ${
          isLive
            ? 'animate-[pulse_3s_ease-in-out_infinite] drop-shadow-[0_0_8px_rgba(21,128,61,0.65)]'
            : ''
        }`}
      >
        <img
          src="/dawadaam-icon.png"
          alt="DawaDaam"
          className="size-9 shrink-0 object-contain sm:size-10"
        />
      </span>
      <span className="text-xl font-extrabold tracking-tight sm:text-2xl">
        <span className="text-[#003B8E] dark:text-[#3898FF]">Dawa</span>
        <span className="text-[#15803D] dark:text-[#4ADE80]">Daam</span>
      </span>
    </span>
  )
}
