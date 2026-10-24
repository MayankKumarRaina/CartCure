import { TrendingUp } from 'lucide-react'
import { formatINR, type PlatformQuote } from '@/lib/pricing'
import type { PlatformId } from '@/lib/data'
import { cn } from '@/lib/utils'

type Row = {
  label: string
  render: (q: PlatformQuote) => React.ReactNode
  emphasis?: boolean
}

const ROWS: Row[] = [
  { label: 'Medicines', render: (q) => formatINR(q.subtotal) },
  {
    label: 'Delivery',
    render: (q) => (q.delivery === 0 ? <span className="text-success">Free</span> : formatINR(q.delivery)),
  },
  { label: 'One-time total', render: (q) => formatINR(q.standardTotal), emphasis: true },
  {
    label: 'Plan fee',
    render: (q) => (
      <span className="flex flex-col leading-tight">
        <span>{formatINR(q.platform.membership.fee)}</span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {q.platform.membership.name} · {q.platform.membership.durationMonths} mo
        </span>
      </span>
    ),
  },
  {
    label: 'Member benefit',
    render: (q) => (
      <span className="flex flex-col leading-tight">
        <span className="text-success">−{formatINR(q.memberBenefit)}</span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {Math.round(q.platform.membership.benefitPct * 100)}%
        </span>
      </span>
    ),
  },
  {
    label: 'Delivery saved',
    render: (q) =>
      q.deliverySaved > 0 ? (
        <span className="text-success">−{formatINR(q.deliverySaved)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { label: 'Pay today w/ plan', render: (q) => formatINR(q.memberPayToday) },
  { label: 'Effective / refill*', render: (q) => formatINR(q.memberEffectivePerRefill), emphasis: true },
  {
    label: 'Break-even',
    render: (q) =>
      q.profitableFromFirstCart ? (
        <span className="text-success">Cart #1</span>
      ) : q.worthIt ? (
        <span className="text-primary">{q.refillsToBreakEven} refills</span>
      ) : (
        <span className="text-muted-foreground">Not worth it</span>
      ),
  },
]

export function MembershipMatrix({
  quotes,
  bestPlatform,
  selectedPlatform,
  onSelectPlatform,
  isLoading = false,
}: {
  quotes: PlatformQuote[]
  bestPlatform: PlatformId | null
  selectedPlatform: PlatformId | null
  onSelectPlatform: (id: PlatformId) => void
  isLoading?: boolean
}) {
  const paidPlans = quotes.filter((quote) => quote.platform.membership.fee > 0)
  const selectedQuote = paidPlans.find((quote) => quote.platform.id === selectedPlatform) ?? paidPlans[0]
  const alternatives = paidPlans.filter((quote) => quote.platform.id !== selectedQuote?.platform.id)
  const fasterAlternative = alternatives
    .filter((quote) => quote.worthIt && quote.refillsToBreakEven < (selectedQuote?.refillsToBreakEven ?? Infinity))
    .sort((a, b) => a.refillsToBreakEven - b.refillsToBreakEven)[0]
  const cheaperAlternative = alternatives
    .filter((quote) => quote.memberEffectivePerRefill < (selectedQuote?.memberEffectivePerRefill ?? Infinity))
    .sort((a, b) => a.memberEffectivePerRefill - b.memberEffectivePerRefill)[0]
  const comparisonAlternative = fasterAlternative ?? cheaperAlternative

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <caption className="sr-only">Membership comparison across platforms for your basket</caption>
          <thead>
            <tr className="bg-card">
              <th scope="col" className="sticky left-0 z-20 w-32 min-w-32 border-b-2 border-transparent bg-card px-2 py-2.5 text-left font-medium text-muted-foreground">
                <span className="sr-only">Metric</span>
              </th>
              {quotes.map((q) => {
                const isBest = q.platform.id === bestPlatform
                const isSelected = q.platform.id === selectedPlatform
                return (
                  <th
                    key={q.platform.id}
                    scope="col"
                    onClick={() => onSelectPlatform(q.platform.id)}
                    className={cn(
                      'px-2 py-2.5 text-right font-semibold cursor-pointer transition-colors border-b-2',
                      isSelected ? 'bg-primary/10 border-primary text-primary' : 'border-transparent hover:bg-muted',
                      isBest && !isSelected && 'bg-success-soft border-success/20 text-success'
                    )}
                  >
                    <span className="flex flex-col items-end gap-0.5">
                      {isBest && (
                        <span className={cn(
                          "rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-success text-success-foreground"
                        )}>
                          Best
                        </span>
                      )}
                      {isSelected && !isBest && (
                        <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Selected
                        </span>
                      )}
                      {q.platform.shortName}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className={cn('border-t', row.emphasis && 'bg-card/60')}>
                <th
                  scope="row"
                  className={cn(
                    'sticky left-0 z-10 w-32 min-w-32 bg-white/95 pr-2 pl-2 text-left text-[11px] font-medium text-slate-500 backdrop-blur-sm dark:bg-slate-900/95 dark:text-slate-400',
                    row.emphasis && 'font-semibold text-foreground',
                  )}
                >
                  {row.label}
                </th>
                {quotes.map((q) => {
                  const isBest = q.platform.id === bestPlatform
                  const isSelected = q.platform.id === selectedPlatform
                  
                  return (
                    <td
                      key={q.platform.id}
                      onClick={() => onSelectPlatform(q.platform.id)}
                      className={cn(
                        'px-2 py-2 text-right tabular-nums cursor-pointer transition-colors',
                        row.emphasis ? 'font-semibold' : 'font-medium',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                        isBest && !isSelected && 'bg-success-soft/30',
                      )}
                    >
                      <span className="inline-flex justify-end">
                        {isLoading ? (
                          <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted" aria-label="Recalculating" />
                        ) : row.render(q)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        *Plan fee spread across {quotes[0]?.platform.membership.durationMonths ?? 6} monthly refills of this basket.
      </p>
      {selectedQuote && (
        <section
          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25"
          aria-labelledby="break-even-heading"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <TrendingUp className="size-4" aria-hidden="true" />
            </span>
            <h3 id="break-even-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Break-even analysis
            </h3>
          </div>

          <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Select membership plan">
            {paidPlans.map((quote) => {
              const isSelected = quote.platform.id === selectedQuote.platform.id
              return (
                <button
                  key={quote.platform.id}
                  type="button"
                  onClick={() => onSelectPlatform(quote.platform.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-[11px] transition-colors',
                    isSelected
                      ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-800/70',
                  )}
                >
                  {quote.platform.shortName} {quote.platform.membership.name}
                </button>
              )
            })}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedQuote.platform.name} {selectedQuote.platform.membership.name}
            </span>
            {' costs '}
            <strong>{formatINR(selectedQuote.platform.membership.fee)}/{selectedQuote.platform.membership.durationMonths} mos.</strong>
            {' On this '}
            <strong>{formatINR(selectedQuote.subtotal)} cart</strong>
            {`, you get ${Math.round(selectedQuote.platform.membership.benefitPct * 100)}% extra discount `}
            <strong>({formatINR(selectedQuote.memberBenefit)})</strong>
            {selectedQuote.platform.membership.freeDelivery
              ? <> + free delivery saved <strong>({formatINR(selectedQuote.deliverySaved)})</strong></>
              : ' + no delivery benefit'}
            {' = '}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {formatINR(selectedQuote.savingsPerOrder)} saved today.
            </strong>
          </p>

          <p className={cn(
            'mt-3 flex w-full items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold',
            selectedQuote.worthIt
              ? 'border-emerald-200 bg-white/90 text-emerald-700 dark:border-emerald-800/70 dark:bg-slate-900/80 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900/70 dark:bg-slate-900/80 dark:text-amber-300',
          )}>
            <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
            {selectedQuote.savingsPerOrder > 0 && selectedQuote.worthIt
              ? `Recovers membership fee in ${selectedQuote.refillsToBreakEven} monthly ${selectedQuote.refillsToBreakEven === 1 ? 'refill' : 'refills'}`
              : selectedQuote.savingsPerOrder === 0
                ? 'No savings on this basket; the plan fee will not break even'
                : `Break-even takes ${selectedQuote.refillsToBreakEven} refills, longer than this ${selectedQuote.platform.membership.durationMonths}-month plan`}
          </p>

          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Monthly refills</span>
              <span className={cn(
                'font-bold',
                selectedQuote.periodNetSavings >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400',
              )}>
                {selectedQuote.platform.membership.durationMonths}-mo net: {selectedQuote.periodNetSavings > 0 ? '+' : ''}{formatINR(selectedQuote.periodNetSavings)}
              </span>
            </div>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${selectedQuote.platform.membership.durationMonths}, minmax(0, 1fr))` }}
              aria-label={`${selectedQuote.platform.membership.durationMonths} monthly refill break-even progress`}
            >
              {Array.from({ length: selectedQuote.platform.membership.durationMonths }, (_, index) => {
                const refill = index + 1
                const recoversFeeThisRefill = selectedQuote.savingsPerOrder > 0
                  && refill >= selectedQuote.refillsToBreakEven
                const isBeforeBreakEven = selectedQuote.savingsPerOrder > 0
                  && refill < selectedQuote.refillsToBreakEven
                return (
                  <div key={refill} className="text-center">
                    <div className={cn(
                      'h-2 rounded-full',
                      recoversFeeThisRefill
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : isBeforeBreakEven
                          ? 'bg-emerald-300/70 dark:bg-emerald-800/60'
                          : 'bg-slate-200 dark:bg-slate-700',
                    )} />
                    <span className="mt-1 block text-[9px] text-slate-500 dark:text-slate-400">#{refill}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {comparisonAlternative && (
            <p className="mt-3 inline-flex rounded-full border border-emerald-200/80 bg-white/80 px-2.5 py-1 text-[11px] leading-relaxed text-slate-600 dark:border-emerald-900/60 dark:bg-slate-900/80 dark:text-slate-300">
              {fasterAlternative
                ? `${fasterAlternative.platform.shortName} breaks even faster in ${fasterAlternative.refillsToBreakEven} ${fasterAlternative.refillsToBreakEven === 1 ? 'refill' : 'refills'}.`
                : `${cheaperAlternative?.platform.shortName} has a lower effective refill cost at ${formatINR(cheaperAlternative?.memberEffectivePerRefill ?? 0)}.`}
            </p>
          )}
        </section>
      )}
    </div>
  )
}