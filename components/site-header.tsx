'use client'
import { type CSSProperties, type MouseEvent, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag } from 'lucide-react'
import { Logo } from '@/components/logo'
import { useCart } from '@/components/cart-provider'
import { InstallChip } from '@/components/install-chip'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> }
}

export function SiteHeader() {
  const { totalItems, setOpen, isLive } = useCart()
  const { setTheme, resolvedTheme } = useTheme()
  const toggleBtnRef = useRef<HTMLButtonElement | null>(null)
  const rippleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [rippleKey, setRippleKey] = useState(0)
  const [isRippling, setIsRippling] = useState(false)

  useEffect(() => () => {
    if (rippleTimeoutRef.current) clearTimeout(rippleTimeoutRef.current)
  }, [])

  const handleThemeToggle = (event: MouseEvent<HTMLButtonElement>) => {
    const root = document.documentElement
    const isCurrentlyDark = root.classList.contains('dark') || resolvedTheme === 'dark'
    const nextTheme = isCurrentlyDark ? 'light' : 'dark'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const viewTransitionDocument = document as ViewTransitionDocument
    if (!viewTransitionDocument.startViewTransition || reducedMotion) {
      setTheme(nextTheme)
      return
    }

    const button = toggleBtnRef.current ?? event.currentTarget
    const rect = button.getBoundingClientRect()
    const x = Math.round(rect.left + rect.width / 2)
    const y = Math.round(rect.top + rect.height / 2)
    const maxRadius = Math.ceil(
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      ),
    )
    root.style.setProperty('--ripple-x', `${x}px`)
    root.style.setProperty('--ripple-y', `${y}px`)
    root.style.setProperty('--ripple-r', `${maxRadius}px`)
    root.style.setProperty('--ripple-scale', ((maxRadius * 2.15) / 100).toFixed(2))

    if (rippleTimeoutRef.current) clearTimeout(rippleTimeoutRef.current)
    root.classList.add('theme-transitioning')
    setRippleKey((previous) => previous + 1)
    setIsRippling(true)
    const cleanup = () => {
      root.classList.remove('theme-transitioning')
      setIsRippling(false)
      if (rippleTimeoutRef.current) clearTimeout(rippleTimeoutRef.current)
      rippleTimeoutRef.current = null
    }
    try {
      const transition = viewTransitionDocument.startViewTransition(() => {
        root.classList.toggle('dark', nextTheme === 'dark')
        root.style.colorScheme = nextTheme
        setTheme(nextTheme)
      })
      void transition.finished.then(cleanup).catch(cleanup)
    } catch (transitionError) {
      setTheme(nextTheme)
      cleanup()
      console.error('Unable to start theme transition:', transitionError)
      return
    }
    rippleTimeoutRef.current = setTimeout(cleanup, 750)
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <a href="/" aria-label="DawaDaam home" className="rounded-md">
          <Logo isLive={isLive} />
        </a>
        <div className="flex items-center gap-2">
          <InstallChip />
          <Button
            ref={toggleBtnRef}
            variant="ghost"
            size="icon"
            onClick={handleThemeToggle}
            className="h-8 w-8 rounded-full transition-transform duration-500 ease-out active:scale-90"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform duration-500 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform duration-500 dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open basket, ${totalItems} item${totalItems === 1 ? '' : 's'}`}
            className="relative flex size-9 items-center justify-center rounded-lg border bg-background text-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <ShoppingBag className="size-[18px]" aria-hidden="true" />
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.span
                  key={totalItems}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground ring-2 ring-background"
                >
                  {totalItems}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
      </header>
      {isRippling && typeof document !== 'undefined' && createPortal(
        <div
          key={rippleKey}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[10000] overflow-hidden"
          style={{
            '--ripple-x': document.documentElement.style.getPropertyValue('--ripple-x'),
            '--ripple-y': document.documentElement.style.getPropertyValue('--ripple-y'),
            '--ripple-r': document.documentElement.style.getPropertyValue('--ripple-r'),
            '--ripple-scale': document.documentElement.style.getPropertyValue('--ripple-scale'),
          } as CSSProperties}
        >
          <div className="water-wave-crest water-wave-primary" />
          <div className="water-wave-crest water-wave-secondary" />
        </div>,
        document.body,
      )}
    </>
  )
}