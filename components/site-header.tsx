'use client'
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
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

type ThemeRipple = {
  x: number
  y: number
  radius: number
  id: number
}

export function SiteHeader() {
  const { totalItems, setOpen, isLive } = useCart()
  const { setTheme } = useTheme()
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const rippleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rippleSequenceRef = useRef(0)
  const [themeRipple, setThemeRipple] = useState<ThemeRipple | null>(null)

  useEffect(() => () => {
    if (rippleTimeoutRef.current) clearTimeout(rippleTimeoutRef.current)
  }, [])

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark')
    const nextTheme = isCurrentlyDark ? 'light' : 'dark'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const viewTransitionDocument = document as ViewTransitionDocument
    if (!viewTransitionDocument.startViewTransition || reducedMotion) {
      setTheme(nextTheme)
      return
    }

    const rect = themeBtnRef.current?.getBoundingClientRect()
    const x = rect ? Math.round(rect.left + rect.width / 2) : window.innerWidth - 56
    const y = rect ? Math.round(rect.top + rect.height / 2) : 28
    const endRadius = Math.ceil(
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      ),
    )
    const root = document.documentElement
    root.style.setProperty('--ripple-x', `${x}px`)
    root.style.setProperty('--ripple-y', `${y}px`)
    root.style.setProperty('--ripple-radius', `${endRadius}px`)

    root.classList.add('theme-transitioning')
    const rippleId = ++rippleSequenceRef.current
    setThemeRipple({ x, y, radius: endRadius, id: rippleId })
    if (rippleTimeoutRef.current) clearTimeout(rippleTimeoutRef.current)
    rippleTimeoutRef.current = setTimeout(() => {
      setThemeRipple((current) => current?.id === rippleId ? null : current)
      rippleTimeoutRef.current = null
    }, 950)

    let transition: ReturnType<NonNullable<ViewTransitionDocument['startViewTransition']>>
    try {
      transition = viewTransitionDocument.startViewTransition(() => {
        root.classList.toggle('dark', nextTheme === 'dark')
        root.classList.toggle('light', nextTheme === 'light')
        root.style.colorScheme = nextTheme
        flushSync(() => setTheme(nextTheme))
      })
    } catch (transitionError) {
      root.classList.remove('theme-transitioning')
      setThemeRipple(null)
      setTheme(nextTheme)
      console.error('Unable to start theme transition:', transitionError)
      return
    }
    void transition.ready.then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 780,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    }).catch((transitionError: unknown) => {
      console.error('Unable to animate theme transition:', transitionError)
    })
    void transition.finished.finally(() => {
      root.classList.remove('theme-transitioning')
    }).catch((transitionError: unknown) => {
      console.error('Theme transition did not finish cleanly:', transitionError)
    })
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
            ref={themeBtnRef}
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
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
      {themeRipple && typeof document !== 'undefined' && createPortal(
        <div
          key={themeRipple.id}
          className="theme-water-ripple-overlay"
          style={{
            '--ripple-x': `${themeRipple.x}px`,
            '--ripple-y': `${themeRipple.y}px`,
            '--ripple-radius': `${themeRipple.radius}px`,
          } as CSSProperties}
          aria-hidden="true"
        >
          <span className="water-ring-1" />
          <span className="water-ring-2" />
          <span className="water-ring-3" />
        </div>,
        document.body,
      )}
    </>
  )
}