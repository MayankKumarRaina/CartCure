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
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[400px] border-collapse text-xs">
          <caption className="sr-only">Membership comparison across platforms for your basket</caption>
          <thead>
            <tr className="bg-card">
              <th scope="col" className="px-3 py-2.5 text-left font-medium text-muted-foreground border-b-2 border-transparent">
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
                    'px-3 py-2 text-left font-normal text-muted-foreground',
                    row.emphasis && 'font-medium text-foreground',
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
    </div>
  )
}