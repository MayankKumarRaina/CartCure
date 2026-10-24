"use client"

import { useState, useMemo } from "react"
import { useCart } from "@/components/cart-provider"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Trash2, Plus, Minus, ExternalLink, ShoppingBag } from "lucide-react"
import { toCartLines, quoteAll, bestOption, formatINR } from "@/lib/pricing"
import { MembershipMatrix } from "@/components/membership-matrix"
import { cn } from "@/lib/utils"
import type { PlatformId } from "@/lib/data"
import { getAffiliateUrl } from "@/lib/affiliates"

function pharmacySearchUrl(platformId: PlatformId, query: string) {
  const encodedQuery = encodeURIComponent(query)
  const urls: Record<PlatformId, string> = {
    tata1mg: `https://www.1mg.com/search/all?name=${encodedQuery}`,
    pharmeasy: `https://pharmeasy.in/search/all?name=${encodedQuery}`,
    netmeds: `https://www.netmeds.com/catalogsearch/result/${encodedQuery}/all`,
    apollo: `https://www.apollopharmacy.in/search-medicines/${encodedQuery}`,
    truemeds: `https://www.truemeds.in/search/${encodedQuery}`,
  }
  return urls[platformId]
}

export function CartDrawer() {
  const { items, increment, decrement, medicines, platforms, isOpen, setOpen, loadingPriceIds } = useCart()
  const [viewMode, setViewMode] = useState<'standard' | 'membership'>('standard')
  const [includeMembership, setIncludeMembership] = useState(false)
  const [selectedPlatformId, setSelectedPlatformId] = useState<PlatformId | null>(null)

  const actualTotalItems = Object.values(items).reduce((sum, qty) => sum + (qty || 0), 0)
  
  const cartLines = useMemo(() => toCartLines(items, medicines), [items, medicines])
  const isPriceLoading = cartLines.some((line) => loadingPriceIds.has(line.medicine.id))
  const quotes = useMemo(() => quoteAll(cartLines, platforms), [cartLines, platforms])
  const sortedQuotes = [...quotes].sort((a, b) => a.standardTotal - b.standardTotal)
  
  const mrpTotal = cartLines.reduce((sum, line) => sum + (line.medicine.mrp * line.qty), 0)
  const best = bestOption(quotes, includeMembership)
  const bestQuote = best ? quotes.find(q => q.platform.id === best.platform.id) ?? null : null
  const activeQuote = selectedPlatformId
    ? quotes.find(q => q.platform.id === selectedPlatformId) ?? bestQuote
    : bestQuote

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent className="!w-screen !max-w-[100vw] sm:!w-screen sm:!max-w-[100vw] md:!w-full md:!max-w-4xl flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2.5 pr-10 text-left">
            <span>Your basket</span>
            <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">
              {actualTotalItems} {actualTotalItems === 1 ? 'item' : 'items'}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50/50 dark:bg-background">
          {actualTotalItems === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
               <ShoppingBag className="size-10 text-slate-300 dark:text-slate-700" />
               <p className="font-semibold text-foreground">Your basket is empty</p>
               <p className="text-xs px-4">Add your monthly medicines to see which platform — and which membership — saves you the most.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {cartLines.map((line) => (
                  <div key={line.medicine.id} className="p-3 border rounded-xl flex items-center justify-between bg-card shadow-sm">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-sm leading-tight">{line.medicine.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        MRP: <span className="line-through">{formatINR(line.medicine.mrp)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border rounded-lg bg-background">
                        <button onClick={() => decrement(line.medicine.id)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                          {line.qty === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-xs font-semibold px-2 w-6 text-center">{line.qty}</span>
                        <button onClick={() => increment(line.medicine.id)} className="p-1.5 text-primary hover:bg-primary-soft transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex p-1 bg-muted rounded-xl">
                <button
                  className={cn("flex-1 p-2 text-xs font-semibold rounded-lg transition-all", viewMode === 'standard' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setViewMode('standard')}
                >
                  <div className="flex flex-col">
                    <span>Standard One-Time Buy</span>
                    <span className="text-[10px] font-normal opacity-70">Pay as you go</span>
                  </div>
                </button>
                <button
                  className={cn("flex-1 p-2 text-xs font-semibold rounded-lg transition-all", viewMode === 'membership' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setViewMode('membership')}
                >
                  <div className="flex flex-col">
                    <span>Compare with Memberships</span>
                    <span className="text-[10px] font-normal opacity-70">Care Plan / Plus</span>
                  </div>
                </button>
              </div>

              {viewMode === 'membership' && (
                <div className="p-3.5 bg-card rounded-xl border flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-xs font-medium text-foreground">Include membership savings in best price</p>
                  </div>
                  <Switch checked={includeMembership} onCheckedChange={setIncludeMembership} />
                </div>
              )}

              {viewMode === 'standard' ? (
                <div className="pt-1 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 ml-1">Standard One-Time Buy</h4>
                  {isPriceLoading && (
                    <p className="text-xs text-muted-foreground" role="status">
                      Fetching competitor prices and recalculating savings…
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-xl border bg-card">
                    <table className="w-full min-w-[640px] border-collapse text-xs">
                      <caption className="sr-only">Standard one-time basket comparison across pharmacies</caption>
                      <thead>
                        <tr className="bg-muted/50">
                          <th scope="col" className="w-28 px-3 py-2 text-left font-medium text-muted-foreground">Basket</th>
                          {quotes.map((quote) => {
                            const isSelected = activeQuote?.platform.id === quote.platform.id
                            const isCheapest = sortedQuotes[0]?.platform.id === quote.platform.id
                            return (
                              <th
                                key={quote.platform.id}
                                scope="col"
                                className={cn(
                                  'border-b-2 px-2 py-2 text-center transition-colors',
                                  isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-transparent',
                                  isCheapest && 'border-success/50 bg-success-soft/60 text-success',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlatformId(quote.platform.id)}
                                  aria-pressed={isSelected}
                                  className="flex w-full flex-col items-center gap-1 font-semibold"
                                >
                                  {isCheapest && !isPriceLoading && (
                                    <span className="rounded-full bg-success px-1.5 py-px text-[9px] font-bold uppercase text-success-foreground">
                                      BEST
                                    </span>
                                  )}
                                  {quote.platform.shortName}
                                </button>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Medicines', value: (quote: typeof quotes[number]) => formatINR(quote.subtotal) },
                          { label: 'Delivery', value: (quote: typeof quotes[number]) => quote.delivery === 0 ? 'Free' : formatINR(quote.delivery), delivery: true },
                          { label: 'One-time total', value: (quote: typeof quotes[number]) => formatINR(quote.standardTotal), emphasis: true },
                          { label: 'Savings vs MRP', value: (quote: typeof quotes[number]) => `Save ${formatINR(Math.max(0, mrpTotal - quote.standardTotal))}`, savings: true },
                        ].map((row) => (
                          <tr key={row.label} className={cn('border-t', row.emphasis && 'bg-muted/40 font-bold')}>
                            <th scope="row" className="px-3 py-2 text-left font-medium text-muted-foreground">{row.label}</th>
                            {quotes.map((quote) => {
                              const isSelected = activeQuote?.platform.id === quote.platform.id
                              const isCheapest = sortedQuotes[0]?.platform.id === quote.platform.id
                              const amount = row.value(quote)
                              const isSaving = row.savings && mrpTotal > quote.standardTotal
                              return (
                                <td
                                  key={quote.platform.id}
                                  className={cn(
                                    'px-1 py-2 text-center tabular-nums',
                                    isSelected && 'bg-primary/5',
                                    isCheapest && !isSelected && 'bg-success-soft/30',
                                    (row.delivery || isSaving) && 'font-semibold text-success',
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPlatformId(quote.platform.id)}
                                    aria-label={`Select ${quote.platform.name}: ${row.label} ${amount}`}
                                    className="w-full"
                                  >
                                    {isPriceLoading && !row.savings
                                      ? <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted" aria-label="Loading price" />
                                      : row.savings && !isSaving
                                        ? '—'
                                        : amount}
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                        <tr className="border-t">
                          <th scope="row" className="px-3 py-2 text-left font-medium text-muted-foreground">Select portal</th>
                          {quotes.map((quote) => {
                            const isSelected = activeQuote?.platform.id === quote.platform.id
                            const isCheapest = sortedQuotes[0]?.platform.id === quote.platform.id
                            return (
                              <td
                                key={quote.platform.id}
                                className={cn(
                                  'px-1 py-2 text-center',
                                  isSelected && 'bg-primary/5',
                                  isCheapest && !isSelected && 'bg-success-soft/30',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlatformId(quote.platform.id)}
                                  aria-label={`Select ${quote.platform.name} portal`}
                                  aria-pressed={isSelected}
                                  className={cn(
                                    'rounded-full border px-2 py-1 text-[10px] font-semibold',
                                    isSelected
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border text-muted-foreground hover:border-primary',
                                  )}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                   {/* Passed the new selection props to the matrix */}
                   <MembershipMatrix 
                     quotes={quotes} 
                     bestPlatform={isPriceLoading ? null : best?.platform.id ?? null}
                     selectedPlatform={activeQuote?.platform.id ?? null}
                     onSelectPlatform={setSelectedPlatformId} 
                     isLoading={isPriceLoading}
                   />
                </div>
              )}
            </>
          )}
        </div>

        {actualTotalItems > 0 && activeQuote && (
          <div className="p-4 border-t bg-card">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-muted-foreground">Basket total today</span>
              <span className="font-bold text-lg">
                {isPriceLoading ? (
                  <span className="inline-block h-5 w-20 animate-pulse rounded bg-muted align-middle" aria-label="Loading basket total" />
                ) : (
                  formatINR(includeMembership && viewMode === 'membership' ? activeQuote.memberPayToday : activeQuote.standardTotal)
                )}
              </span>
            </div>
            <Button
              type="button"
              disabled={isPriceLoading}
              className="w-full h-12 text-sm font-semibold bg-success hover:bg-success/90 text-success-foreground rounded-xl flex items-center justify-center gap-2"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()

                const primaryMedicine = cartLines[0]?.medicine
                if (!primaryMedicine) return
                const productUrl = cartLines.length === 1
                  ? primaryMedicine.productUrls?.[activeQuote.platform.id]
                  : undefined
                const standardUrl = productUrl && /^https?:\/\//i.test(productUrl)
                  ? productUrl
                  : pharmacySearchUrl(activeQuote.platform.id, primaryMedicine.name)
                const targetUrl = getAffiliateUrl(activeQuote.platform.id, standardUrl)

                window.open(targetUrl, '_blank', 'noopener,noreferrer')

                if (navigator.clipboard && cartLines.length > 0) {
                  const list = cartLines
                    .map(({ medicine, qty }) => `${qty}x ${medicine.name}`)
                    .join('\n')
                  void navigator.clipboard.writeText(list).catch(() => {})
                }
              }}
            >
              <span>{isPriceLoading ? 'Updating prices…' : `Proceed to ${activeQuote.platform.name}`}</span>
              {!isPriceLoading && <ExternalLink className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}