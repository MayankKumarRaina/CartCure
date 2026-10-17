'use client'

import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/cart-provider'
import { bestOption, formatINR, quoteAll, toCartLines } from '@/lib/pricing'

export function BasketBar() {
  // 1. Extract live platforms from useCart
  const { items, setOpen, isOpen, medicines, platforms } = useCart()
  
  // Accurately count total quantities across the dictionary
  const actualTotalItems = Object.values(items).reduce((sum, qty) => sum + (qty || 0), 0)
  
  const cartLines = useMemo(() => toCartLines(items, medicines), [items, medicines])
  
  // 2. Pass platforms into quoteAll so it uses Supabase auto-detected memberships
  const quotes = useMemo(() => quoteAll(cartLines, platforms), [cartLines, platforms])
  const best = useMemo(() => bestOption(quotes, false), [quotes])

  return (
    <AnimatePresence>
      {actualTotalItems > 0 && best && !isOpen && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mx-auto flex h-auto w-full max-w-md items-center gap-3 rounded-2xl bg-foreground px-3.5 py-2.5 text-left leading-tight text-background shadow-xl shadow-slate-900/20 active:scale-[0.99] sm:px-4"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-background/10">
              <ShoppingBag className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">
                {actualTotalItems} {actualTotalItems === 1 ? 'item' : 'items'} · from {formatINR(best.cost ?? best.standardTotal)}
              </span>
              <span className="text-[11px] text-background/70">
                Cheapest on {best.platform.name}
                {best.savings > 0 ? ` · save ${formatINR(best.savings)}` : ''}
              </span>
            </span>
            <span className="flex items-center gap-0.5 text-xs font-medium text-teal-300">
              Compare
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}