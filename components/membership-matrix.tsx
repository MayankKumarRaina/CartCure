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
}: {
  quotes: PlatformQuote[]
  bestPlatform: PlatformId | null
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[340px] border-collapse text-xs">
          <caption className="sr-only">Membership comparison across platforms for your basket</caption>
          <thead>
            <tr className="bg-card">
              <th scope="col" className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                <span className="sr-only">Metric</span>
              </th>
              {quotes.map((q) => {
                const best = q.platform.id === bestPlatform
                return (
                  <th
                    key={q.platform.id}
                    scope="col"
                    className={cn('px-2 py-2.5 text-right font-semibold', best && 'bg-success-soft text-success')}
                  >
                    <span className="flex flex-col items-end gap-0.5">
                      {best && (
                        <span className="rounded-full bg-success px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-success-foreground">
                          Best
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
                {quotes.map((q) => (
                  <td
                    key={q.platform.id}
                    className={cn(
                      'px-2 py-2 text-right tabular-nums',
                      row.emphasis ? 'font-semibold' : 'font-medium',
                      q.platform.id === bestPlatform && 'bg-success-soft/70',
                    )}
                  >
                    <span className="inline-flex justify-end">{row.render(q)}</span>
                  </td>
                ))}
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
