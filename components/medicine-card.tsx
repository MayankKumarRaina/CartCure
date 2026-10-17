'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, FileText, Minus, Plus } from 'lucide-react'
import { PLATFORMS, type Medicine } from '@/lib/data'
import { formatINR, lowestPlatformFor } from '@/lib/pricing'
import { useCart } from '@/components/cart-provider'
import { cn } from '@/lib/utils'

export function MedicineCard({ medicine }: { medicine: Medicine }) {
  const { items, add, increment, decrement } = useCart()
  const qty = items[medicine.id] ?? 0
  const lowestId = lowestPlatformFor(medicine)
  const lowestPrice = medicine.prices[lowestId]
  const [justAdded, setJustAdded] = useState(false)

  const handleAdd = () => {
    add(medicine.id)
    navigator.vibrate?.(12)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 900)
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-3.5 sm:p-5"
      aria-labelledby={`${medicine.id}-title`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`${medicine.id}-title`} className="text-[15px] font-semibold leading-snug text-pretty">
            {medicine.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {medicine.pack} <span aria-hidden="true">·</span> {medicine.manufacturer}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Salt:</span> {medicine.salt}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {medicine.rxRequired && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <FileText className="size-3" aria-hidden="true" />
              Rx
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            MRP <span className="line-through">{formatINR(medicine.mrp)}</span>
          </span>
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-2" aria-label="Price on each platform">
        {PLATFORMS.map((p) => {
          const isLowest = p.id === lowestId
          return (
            <li
              key={p.id}
              className={cn(
                'relative flex flex-col gap-0.5 rounded-xl border bg-background p-2',
                isLowest && 'border-success/40 bg-success-soft',
              )}
            >
              {isLowest && (
                <span className="absolute -top-2 left-2 rounded-full bg-success px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-success-foreground sm:text-[10px]">
                  Lowest
                </span>
              )}
              <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">{p.name}</span>
              <span
                className={cn(
                  'text-base font-semibold tabular-nums',
                  isLowest ? 'text-success' : 'text-foreground',
                )}
              >
                {formatINR(medicine.prices[p.id])}
              </span>
              <span className="sr-only">{isLowest ? 'Lowest base price' : ''}</span>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Save up to{' '}
          <span className="font-semibold text-success">{formatINR(medicine.mrp - lowestPrice)}</span>{' '}
          vs MRP
        </p>

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
                'inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors',
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
