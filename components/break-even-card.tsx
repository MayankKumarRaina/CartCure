'use client'

import { motion } from 'framer-motion'
import { CircleAlert, PartyPopper, TrendingUp } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatINR, type PlatformQuote } from '@/lib/pricing'
import type { PlatformId } from '@/lib/data'
import { cn } from '@/lib/utils'

export function BreakEvenCard({
  quotes,
  defaultPlatform,
}: {
  quotes: PlatformQuote[]
  defaultPlatform: PlatformId
}) {
  return (
    <section
      aria-labelledby="break-even-heading"
      className="flex flex-col gap-3 rounded-2xl border border-success/25 bg-gradient-to-b from-success-soft to-background p-4"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-success text-success-foreground">
          <TrendingUp className="size-4" aria-hidden="true" />
        </span>
        <h3 id="break-even-heading" className="text-sm font-semibold">
          Break-even analysis
        </h3>
      </div>

      <Tabs defaultValue={defaultPlatform} className="gap-3">
        <TabsList className="w-full">
          {quotes.map((q) => (
            <TabsTrigger key={q.platform.id} value={q.platform.id} className="text-xs">
              {q.platform.shortName} {q.platform.membership.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {quotes.map((q) => (
          <TabsContent key={q.platform.id} value={q.platform.id}>
            <BreakEvenDetail quote={q} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function BreakEvenDetail({ quote: q }: { quote: PlatformQuote }) {
  const m = q.platform.membership
  const months = Array.from({ length: m.durationMonths }, (_, i) => i + 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className="flex flex-col gap-4"
    >
      <p className="text-[13px] leading-relaxed text-foreground/90 text-pretty">
        <span className="font-semibold">
          {q.platform.name} {m.name}
        </span>{' '}
        costs{' '}
        <span className="font-semibold">
          {formatINR(m.fee)}/{m.durationMonths} mos
        </span>
        . On this <span className="font-semibold">{formatINR(q.subtotal)}</span> cart, you get{' '}
        {m.benefitLabel} <span className="font-semibold tabular-nums">({formatINR(q.memberBenefit)})</span>
        {q.deliverySaved > 0 ? (
          <>
            {' '}
            + free delivery saved{' '}
            <span className="font-semibold tabular-nums">({formatINR(q.deliverySaved)})</span>
          </>
        ) : (
          <> (delivery is already free on this cart)</>
        )}{' '}
        = <span className="font-semibold text-success">{formatINR(q.savingsPerOrder)} saved today</span>.
      </p>

      <StatusPill quote={q} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Monthly refills</span>
          <span>
            {m.durationMonths}-mo net:{' '}
            <span
              className={cn(
                'font-semibold tabular-nums',
                q.periodNetSavings >= 0 ? 'text-success' : 'text-destructive',
              )}
            >
              {q.periodNetSavings >= 0 ? '+' : '−'}
              {formatINR(Math.abs(q.periodNetSavings))}
            </span>
          </span>
        </div>
        <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${m.durationMonths}, minmax(0, 1fr))` }}>
          {months.map((month) => {
            const recovered = month * q.savingsPerOrder >= m.fee
            return (
              <li key={month} className="flex flex-col items-center gap-1">
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: month * 0.05, type: 'spring', stiffness: 300, damping: 30 }}
                  className={cn(
                    'h-1.5 w-full origin-left rounded-full',
                    recovered ? 'bg-success' : 'bg-primary/30',
                  )}
                />
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  <span className="sr-only">Refill </span>#{month}
                  <span className="sr-only">{recovered ? ', fee recovered' : ', recovering fee'}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </motion.div>
  )
}

function StatusPill({ quote: q }: { quote: PlatformQuote }) {
  if (q.profitableFromFirstCart) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-success px-3 py-2 text-[13px] font-medium text-success-foreground">
        <PartyPopper className="size-4" aria-hidden="true" />
        Profitable from Cart #1!
      </div>
    )
  }
  if (q.worthIt) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary-soft px-3 py-2 text-[13px] font-medium text-primary">
        <TrendingUp className="size-4" aria-hidden="true" />
        Recovers membership fee in {q.refillsToBreakEven} monthly refill
        {q.refillsToBreakEven === 1 ? '' : 's'}
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-xl border bg-background px-3 py-2 text-[13px] text-muted-foreground">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Needs {Number.isFinite(q.refillsToBreakEven) ? q.refillsToBreakEven : 'many'} refills to break even
        — longer than the {q.platform.membership.durationMonths}-month plan. Skip it for this cart.
      </span>
    </div>
  )
}
