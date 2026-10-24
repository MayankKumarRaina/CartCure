'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ExternalLink, FileText, Minus, Plus } from 'lucide-react'
import { PLATFORMS, type CatalogMedicine } from '@/lib/data'
import { formatINR, lowestPlatformFor } from '@/lib/pricing'
import { useCart } from '@/components/cart-provider'
import { getAffiliateUrl } from '@/lib/affiliates'
import { cn } from '@/lib/utils'

export function MedicineCard({ medicine }: { medicine: CatalogMedicine }) {
  const { items, add, increment, decrement, loadingPriceIds, resolveLivePrices } = useCart()
  const qty = items[medicine.id] ?? 0
  const isPriceLoading = loadingPriceIds.has(medicine.id)
  const hasAnyLivePrices = medicine.livePricePlatforms === undefined || medicine.livePricePlatforms.length > 0
  const lowestId = lowestPlatformFor(medicine)
  const lowestPrice = medicine.prices[lowestId]
  const [justAdded, setJustAdded] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = cardRef.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') {
      void resolveLivePrices(medicine).catch(() => {})
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        void resolveLivePrices(medicine).catch(() => {})
      }
    }, { rootMargin: '80px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [medicine, resolveLivePrices])

  const handleAdd = () => {
    add(medicine.id)
    navigator.vibrate?.(12)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 900)
  }

  return (
    <motion.article
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:p-4"
      aria-labelledby={`${medicine.id}-title`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`${medicine.id}-title`} className="text-sm font-semibold leading-snug text-pretty">
            {medicine.name}
          </h3>
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {medicine.pack} <span aria-hidden="true">·</span> {medicine.manufacturer}
          </p>
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Salt:</span> {medicine.salt}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {medicine.rxRequired && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              <FileText className="size-3" aria-hidden="true" />
              Rx
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            MRP <span className="line-through">{formatINR(medicine.mrp)}</span>
          </span>
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label="Price on each platform">
        {PLATFORMS.map((p) => {
          const isLowest = hasAnyLivePrices && !isPriceLoading && p.id === lowestId
          const hasLivePrice = medicine.livePricePlatforms?.includes(p.id) ?? true
          return (
            <li
              key={p.id}
              className={cn(
                'relative min-w-0 rounded-xl border bg-background',
                isLowest && 'border-success/40 bg-success-soft',
              )}
            >
              {isLowest && (
                <span className="absolute -top-1.5 right-1 z-10 rounded-md bg-success px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-success-foreground">
                  Lowest
                </span>
              )}
              <a
                href={getAffiliateUrl(p.id, p.searchUrl(medicine.name))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${medicine.name} at ${p.name}`}
                className="flex min-h-[52px] min-w-0 items-center justify-between gap-1.5 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium leading-tight text-slate-400">
                    {p.id === 'tata1mg' ? 'Tata 1mg' : p.shortName}
                  </span>
                  {isPriceLoading ? (
                    <span className="mt-1 block h-4 w-12 animate-pulse rounded bg-muted" aria-label="Loading price" />
                  ) : hasLivePrice ? (
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-sm font-bold leading-tight tracking-tight tabular-nums sm:text-[15px]',
                        isLowest ? 'text-success' : 'text-foreground',
                      )}
                    >
                      {formatINR(medicine.prices[p.id])}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-sm font-medium leading-tight text-muted-foreground">
                      —
                    </span>
                  )}
                </span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                <span className="sr-only">{isLowest ? 'Lowest base price' : ''}</span>
              </a>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between gap-2">
        {isPriceLoading ? (
          <span className="h-3 w-28 animate-pulse rounded bg-muted" aria-label="Recalculating savings" />
        ) : !hasAnyLivePrices ? (
          <p className="text-xs text-muted-foreground">Add to basket to compare live prices</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Save up to{' '}
            <span className="font-semibold text-success">{formatINR(medicine.mrp - lowestPrice)}</span>{' '}
            vs MRP
          </p>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {qty === 0 || justAdded ? (
            <motion.button
              key="add"
              type="button"
              onClick={justAdded ? undefined : handleAdd}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
                justAdded
                  ? 'bg-success text-success-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {justAdded ? (
                <>
                  <Check className="size-4" aria-hidden="true" />
                  Added
                </>
              ) : (
                <>
                  <Plus className="size-4" aria-hidden="true" />
                  Add to Basket
                </>
              )}
            </motion.button>
          ) : (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="flex h-9 items-center rounded-lg border bg-background"
            >
              <button
                type="button"
                onClick={() => decrement(medicine.id)}
                aria-label={`Decrease ${medicine.name} quantity`}
                className="flex size-9 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => increment(medicine.id)}
                aria-label={`Increase ${medicine.name} quantity`}
                className="flex size-9 items-center justify-center rounded-r-lg text-primary hover:bg-primary-soft"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  )
}
