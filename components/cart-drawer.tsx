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

interface CartDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  // 1. Extract live platforms from useCart
  const { items, increment, decrement, medicines, platforms } = useCart()
  const [viewMode, setViewMode] = useState<'standard' | 'membership'>('standard')
  const [includeMembership, setIncludeMembership] = useState(false)
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null)

  // Accurately count items to prevent phantom rendering
  const actualTotalItems = Object.values(items).reduce((sum, qty) => sum + (qty || 0), 0)
  
  // Core pricing engine
  const cartLines = useMemo(() => toCartLines(items, medicines), [items, medicines])
  
  // 2. Pass platforms into quoteAll so the matrix uses auto-detected Supabase memberships
  const quotes = useMemo(() => quoteAll(cartLines, platforms), [cartLines, platforms])
  const sortedQuotes = [...quotes].sort((a, b) => a.standardTotal - b.standardTotal)
  
  const mrpTotal = cartLines.reduce((sum, line) => sum + (line.medicine.mrp * line.quantity), 0)
  const best = bestOption(quotes, includeMembership)
  
  // Allow manual override, otherwise default to absolute cheapest
  const activeQuote = selectedPlatformId 
    ? quotes.find(q => q.platform.id === selectedPlatformId) || best 
    : best

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-left flex items-center justify-between">
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
              {/* Basket Items List */}
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
                          {line.quantity === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-xs font-semibold px-2 w-6 text-center">{line.quantity}</span>
                        <button onClick={() => increment(line.medicine.id)} className="p-1.5 text-primary hover:bg-primary-soft transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* View Toggle */}
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

              {/* Content based on view mode */}
              {viewMode === 'standard' ? (
                <div className="pt-1 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 ml-1">Basket Total By Platform</h4>
                  {sortedQuotes.map((quote) => {
                    const isSelected = activeQuote?.platform.id === quote.platform.id
                    const isCheapest = sortedQuotes[0].platform.id === quote.platform.id
                    const standardSavings = mrpTotal - quote.standardTotal

                    return (
                      <div
                        key={quote.platform.id}
                        onClick={() => setSelectedPlatformId(quote.platform.id)}
                        className={cn(
                          "p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                          isSelected ? "border-success bg-success-soft ring-1 ring-success/30 shadow-sm" : "bg-card hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{quote.platform.name}</span>
                              {isCheapest && (
                                <span className="text-[9px] bg-success text-success-foreground font-bold px-1.5 py-0.5 rounded-sm">
                                  CHEAPEST
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground mt-1 block">
                              {formatINR(quote.subtotal)} + {quote.delivery === 0 ? 'Free' : formatINR(quote.delivery)} delivery
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{formatINR(quote.standardTotal)}</p>
                          {standardSavings > 0 && (
                            <p className="text-[11px] font-medium text-success mt-0.5">
                              Save {formatINR(standardSavings)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="pt-2">
                   <MembershipMatrix quotes={quotes} bestPlatform={best?.platform.id ?? null} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Dynamic Outbound Checkout Footer */}
        {actualTotalItems > 0 && activeQuote && (
          <div className="p-4 border-t bg-card">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-muted-foreground">Basket total today</span>
              <span className="font-bold text-lg">
                {formatINR(includeMembership && viewMode === 'membership' ? activeQuote.memberPayToday : activeQuote.standardTotal)}
              </span>
            </div>
            <Button
              className="w-full h-12 text-sm font-semibold bg-success hover:bg-success/90 text-success-foreground rounded-xl flex items-center justify-center gap-2"
              onClick={() => {
                // In future: Route to real checkout. For now, alerts to confirm selected platform works.
                alert(`Redirecting to ${activeQuote.platform.name} checkout...`)
              }}
            >
              <span>Proceed to {activeQuote.platform.name}</span>
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}