export function Logo({ isLive = false }: { isLive?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        title={isLive ? 'Connected to Live Database' : undefined}
        aria-label={isLive ? 'Connected to Live Database' : undefined}
        aria-hidden={!isLive}
        className={`relative flex size-8 shrink-0 items-center justify-center transition-all duration-700 ${
          isLive
            ? 'animate-[pulse_3s_ease-in-out_infinite] drop-shadow-[0_0_8px_rgba(21,128,61,0.65)]'
            : ''
        }`}
      >
        <svg viewBox="0 0 40 40" className="size-full" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="dawadaam-blue" x1="7" y1="20" x2="34" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#003B8E" />
              <stop offset="1" stopColor="#0088E8" />
            </linearGradient>
            <linearGradient id="dawadaam-green" x1="23" y1="9" x2="37" y2="31" gradientUnits="userSpaceOnUse">
              <stop stopColor="#15803D" />
              <stop offset="1" stopColor="#65C922" />
            </linearGradient>
          </defs>
          <path
            d="M7 4.5h12.5c10.6 0 17.5 6.2 17.5 15.5s-6.9 15.5-17.5 15.5H7V4.5Z"
            fill="url(#dawadaam-blue)"
          />
          <path
            d="M23.4 6.2C31.5 7.6 37 12.6 37 20c-5.6-1-10.1-4.8-13.6-13.8Z"
            fill="url(#dawadaam-green)"
          />
          <rect x="14" y="18" width="13" height="4" rx="2" fill="#65C922" />
          <rect x="18.5" y="13.5" width="4" height="13" rx="2" fill="#65C922" />
        </svg>
      </span>
      <span className="text-[15px] font-bold tracking-tight">
        <span className="text-[#004799] dark:text-[#3898FF]">Dawa</span>
        <span className="text-[#15803D] dark:text-[#4ADE80]">Daam</span>
      </span>
    </span>
  )
}
