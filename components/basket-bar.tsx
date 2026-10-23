'use client'

import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/cart-provider'
import { bestOption, formatINR, quoteAll, toCartLines } from '@/lib/pricing'

export function BasketBar() {
  // 1. Extract live platforms from useCart
  const { items, setOpen, isOpen, medicines, platforms, loadingPriceIds } = useCart()
  
  // Accurately count total quantities across the dictionary
  const actualTotalItems = Object.values(items).reduce((sum, qty) => sum + (qty || 0), 0)
  
  const cartLines = useMemo(() => toCartLines(items, medicines), [items, medicines])
  const isPriceLoading = cartLines.some((line) => loadingPriceIds.has(line.medicine.id))
  
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
            className="mx-auto flex h-auto w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 text-left leading-tight text-slate-900 shadow-[0_12px_36px_rgba(15,23,42,0.12)] active:scale-[0.99] dark:border-slate-800 dark:bg-[#0B1120]/95 dark:text-slate-100 dark:shadow-[0_12px_36px_rgba(0,0,0,0.55)] sm:px-4"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <ShoppingBag className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">
                {actualTotalItems} {actualTotalItems === 1 ? 'item' : 'items'} ·{' '}
                {isPriceLoading ? (
                  <span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-200 align-middle dark:bg-slate-700" aria-label="Loading prices" />
                ) : (
                  <>from {formatINR(best.cost)}</>
                )}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400">
                {isPriceLoading
                  ? 'Fetching competitor prices…'
                  : <>Cheapest on {best.platform.name}{best.savings > 0 ? ` · save ${formatINR(best.savings)}` : ''}</>}
              </span>
            </span>
            <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Compare
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}