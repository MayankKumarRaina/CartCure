'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Minus, Pill, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useCart } from '@/components/cart-provider'
import { MembershipMatrix } from '@/components/membership-matrix'
import { BreakEvenCard } from '@/components/break-even-card'
import { useMediaQuery } from '@/hooks/use-media-query'
import { bestOption, formatINR, quoteAll, toCartLines, type CartLine, type PlatformQuote } from '@/lib/pricing'
import { cn } from '@/lib/utils'

const spring = { type: 'spring', stiffness: 420, damping: 34 } as const

export function CartDrawer() {
  const { items, isOpen, setOpen, totalItems, medicines } = useCart()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [compareMemberships, setCompareMemberships] = useState(false)

  const lines = useMemo(() => toCartLines(items, medicines), [items, medicines])
  const quotes = useMemo(() => quoteAll(lines), [lines])
  const best = useMemo(() => bestOption(quotes, compareMemberships), [quotes, compareMemberships])
  const bestMembership = useMemo(
    () => quotes.reduce((a, b) => (b.periodNetSavings > a.periodNetSavings ? b : a), quotes[0]),
    [quotes],
  )

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={cn(
          'gap-0 p-0',
          'overflow-x-hidden',
          'data-[side=right]:w-full data-[side=right]:sm:max-w-lg',
          'data-[side=bottom]:max-h-[92dvh] data-[side=bottom]:rounded-t-3xl',
        )}
      >
        {!isDesktop && (
          <div className="flex justify-center pt-2.5" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>
        )}
        <SheetHeader className="border-b px-5 pb-4 pt-4 md:pt-5">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            Your basket
            {totalItems > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Compare the full basket across platforms and memberships.
          </SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <EmptyState onBrowse={() => setOpen(false)} />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="flex flex-col gap-5 px-5 py-5">
                <LineItems lines={lines} />

                <ModeToggle checked={compareMemberships} onChange={setCompareMemberships} />

                <AnimatePresence mode="wait" initial={false}>
                  {compareMemberships ? (
                    <motion.div
                      key="memberships"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={spring}
                      className="flex flex-col gap-4"
                    >
                      <MembershipMatrix
                        quotes={quotes}
                        bestPlatform={best?.platform.id ?? null}
                      />
                      <BreakEvenCard
                        key={bestMembership.platform.id}
                        quotes={quotes}
                        defaultPlatform={bestMembership.platform.id}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="standard"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={spring}
                    >
                      <StandardComparison quotes={quotes} bestId={best?.platform.id ?? null} />
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Prices and membership terms are indicative and may change on each platform. A valid
                  prescription is required for Rx medicines.
                </p>
              </div>
            </div>

            {best && (
              <div className="border-t bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <div className="mb-2.5 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>
                    {best.withMembership
                      ? `Effective per refill with ${best.platform.membership.name}`
                      : 'Best total today'}
                  </span>
                  <motion.span
                    key={`${best.platform.id}-${best.cost}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-lg font-semibold tabular-nums text-foreground"
                  >
                    {formatINR(best.cost)}
                  </motion.span>
                </div>
                <motion.a
                  whileTap={{ scale: 0.98 }}
                  href={best.platform.searchUrl(lines[0].medicine.name.split(' ').slice(0, 2).join(' '))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-colors hover:bg-primary/90 sm:text-sm"
                >
                  <span className="truncate">
                    Proceed to {best.platform.name}
                    {best.withMembership ? ` + ${best.platform.membership.name}` : ''}
                    {best.savings > 0 && (
                      <span className="font-medium text-primary-foreground/85">
                        {' '}
                        (Save {formatINR(best.savings)})
                      </span>
                    )}
                  </span>
                  <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </motion.a>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function LineItems({ lines }: { lines: CartLine[] }) {
  const { increment, decrement, remove } = useCart()

  return (
    <ul className="flex flex-col gap-2" aria-label="Medicines in basket">
      <AnimatePresence initial={false}>
        {lines.map(({ medicine, qty }) => {
          const low = Math.min(...Object.values(medicine.prices))
          return (
            <motion.li
              key={medicine.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Pill className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{medicine.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{medicine.pack}</p>
                  </div>
                  <button type="button" onClick={() => remove(medicine.id)} aria-label={`Remove ${medicine.name}`} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center justify-between pl-11">
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">From {formatINR(low)}</span>
                  <div className="flex items-center rounded-lg border bg-background">
                  <button
                    type="button"
                    onClick={() => decrement(medicine.id)}
                    aria-label={`Decrease ${medicine.name} quantity`}
                    className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Minus className="size-3.5" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <button
                    type="button"
                    onClick={() => increment(medicine.id)}
                    aria-label={`Increase ${medicine.name} quantity`}
                    className="flex size-8 items-center justify-center text-primary"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                </div>
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

function ModeToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-1.5">
      <div className="relative grid grid-cols-2" role="radiogroup" aria-label="Pricing mode">
        {[
          { value: false, title: 'Standard One-Time Buy', sub: 'Pay as you go' },
          { value: true, title: 'Compare with Memberships', sub: '1mg Care Plan / PharmEasy Plus' },
        ].map((opt) => {
          const active = checked === opt.value
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className="relative isolate flex flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
            >
              {active && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 -z-10 rounded-xl border bg-background shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
              <span className={cn('text-[13px] font-semibold', active ? 'text-foreground' : 'text-muted-foreground')}>
                {opt.title}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">{opt.sub}</span>
            </button>
          )
        })}
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 px-3 pb-1.5 pt-1 text-xs text-muted-foreground">
        <span>Include membership savings in the best price</span>
        <Switch checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} aria-label="Compare with memberships" />
      </label>
    </div>
  )
}

function StandardComparison({ quotes, bestId }: { quotes: PlatformQuote[]; bestId: string | null }) {
  const worst = Math.max(...quotes.map((q) => q.standardTotal))
  const sorted = [...quotes].sort((a, b) => a.standardTotal - b.standardTotal)

  return (
    <section aria-labelledby="standard-heading" className="flex flex-col gap-2">
      <h3 id="standard-heading" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Basket total by platform
      </h3>
      <ul className="flex flex-col gap-2">
        {sorted.map((q) => {
          const isBest = q.platform.id === bestId
          return (
            <motion.li
              layout
              key={q.platform.id}
              transition={spring}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border bg-background p-3',
                isBest && 'border-success/40 bg-success-soft',
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {q.platform.name}
                  {isBest && (
                    <span className="rounded-full bg-success px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-success-foreground">
                      Cheapest
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatINR(q.subtotal)} +{' '}
                  {q.delivery === 0 ? 'free delivery' : `${formatINR(q.delivery)} delivery`}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className={cn('text-base font-semibold tabular-nums', isBest && 'text-success')}>
                  {formatINR(q.standardTotal)}
                </span>
                {q.standardTotal < worst && (
                  <span className="text-[11px] font-medium text-success tabular-nums">
                    Save {formatINR(worst - q.standardTotal)}
                  </span>
                )}
              </div>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <ShoppingBag className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">Your basket is empty</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Add your monthly medicines to see which platform — and which membership — saves you the most.
      </p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-1 h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Browse medicines
      </button>
    </div>
  )
}
