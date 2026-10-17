'use client'
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag } from 'lucide-react'
import { Logo } from '@/components/logo'
import { InstallChip } from '@/components/install-chip'
import { useCart } from '@/components/cart-provider'

export function SiteHeader() {
  const { totalItems, setOpen, isLive } = useCart()
  const { theme, setTheme } = useTheme()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <a href="/" aria-label="CartCure home" className="rounded-md">
          <Logo />
        </a>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {isLive ? 'Live DB' : 'Demo Data'}
          </span>
          <InstallChip />
          
          {/* Dark Mode Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="h-8 w-8 rounded-full"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
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
  )
}