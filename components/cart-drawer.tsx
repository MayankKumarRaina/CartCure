"use client"

import { useState } from "react"
import { useCart } from "@/components/cart-provider"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Trash2, Plus, Minus, ExternalLink, Check } from "lucide-react"

interface CartDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Baseline platform delivery fees and standard thresholds
const PLATFORM_CONFIG: Record<string, { deliveryFee: number; minFreeDelivery: number }> = {
  "Tata 1mg": { deliveryFee: 50, minFreeDelivery: 500 },
  "PharmEasy": { deliveryFee: 49, minFreeDelivery: 499 },
  "Netmeds": { deliveryFee: 49, minFreeDelivery: 500 },
  "Apollo Pharmacy": { deliveryFee: 40, minFreeDelivery: 400 },
  "Truemeds": { deliveryFee: 50, minFreeDelivery: 500 },
  "MedPlus": { deliveryFee: 35, minFreeDelivery: 350 },
}

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const { items, removeItem, updateQuantity } = useCart()
  const [includeMembership, setIncludeMembership] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

  // Collect all unique platforms present across all items in basket
  const platformNames = Array.from(
    new Set(
      items.flatMap((item) =>
        (item.medicine.pharmacy_prices || []).map((p) => p.platform_name)
      )
    )
  )

  // Calculate totals per platform
  const platformTotals = platformNames.map((platform) => {
    let medicineTotal = 0
    let mrpTotal = 0
    let primaryCheckoutUrl = ""

    items.forEach((item) => {
      const match = item.medicine.pharmacy_prices?.find(
        (p) => p.platform_name === platform
      )
      const unitPrice = match?.selling_price ?? item.medicine.mrp
      medicineTotal += unitPrice * item.quantity
      mrpTotal += item.medicine.mrp * item.quantity

      if (!primaryCheckoutUrl && match?.product_url) {
        primaryCheckoutUrl = match.product_url
      }
    })

    const config = PLATFORM_CONFIG[platform] || { deliveryFee: 50, minFreeDelivery: 500 }
    const deliveryFee = medicineTotal >= config.minFreeDelivery ? 0 : config.deliveryFee
    const totalWithoutPlan = medicineTotal + deliveryFee

    return {
      name: platform,
      medicineTotal,
      mrpTotal,
      deliveryFee,
      total: totalWithoutPlan,
      savings: mrpTotal - totalWithoutPlan,
      checkoutUrl: primaryCheckoutUrl || "#",
    }
  })

  // Sort by lowest price first
  platformTotals.sort((a, b) => a.total - b.total)
  const cheapestPlatform = platformTotals[0]

  // Active choice: user's manual selection, fallback to cheapest
  const activePlatform =
    platformTotals.find((p) => p.name === selectedPlatform) || cheapestPlatform

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-left flex items-center justify-between">
            <span>Your basket</span>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 px-2.5 py-1 rounded-full font-medium">
              {items.reduce((acc, i) => acc + i.quantity, 0)} items
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Your basket is empty. Add medicines to compare carts.
            </div>
          ) : (
            <>
              {/* Basket Items List */}
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.medicine.id}
                    className="p-3 border rounded-xl flex items-center justify-between bg-white dark:bg-slate-900 shadow-sm"
                  >
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-sm leading-tight text-slate-900 dark:text-slate-100">
                        {item.medicine.brand_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.medicine.pack_size}
                      </p>
                      <p className="text-xs font-medium text-emerald-600 mt-1">
                        MRP: ₹{item.medicine.mrp}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center border rounded-lg bg-slate-50 dark:bg-slate-800">
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity - 1)}
                          className="p-1.5 hover:text-red-500 transition"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-semibold px-2">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity + 1)}
                          className="p-1.5 hover:text-emerald-500 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(item.medicine.id)}
                        className="text-slate-400 hover:text-red-500 transition p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Membership Switcher */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Include membership savings
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Factor in 1mg Care Plan & PharmEasy Plus
                  </p>
                </div>
                <Switch
                  checked={includeMembership}
                  onCheckedChange={setIncludeMembership}
                />
              </div>

              {/* Select Platform Header */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Choose Store
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Tap any platform to switch
                  </span>
                </div>

                {/* Clickable Platform Selection Cards */}
                <div className="space-y-2">
                  {platformTotals.map((platform) => {
                    const isSelected = activePlatform?.name === platform.name
                    const isCheapest = cheapestPlatform?.name === platform.name

                    return (
                      <div
                        key={platform.name}
                        onClick={() => setSelectedPlatform(platform.name)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-600 shadow-sm"
                            : "border-slate-200 hover:border-slate-300 bg-white dark:bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {platform.name}
                              </span>
                              {isCheapest && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                  CHEAPEST
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">
                              ₹{platform.medicineTotal} + ₹{platform.deliveryFee} delivery
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                            ₹{platform.total}
                          </p>
                          {platform.savings > 0 && (
                            <p className="text-[11px] font-semibold text-emerald-600">
                              Save ₹{platform.savings}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Dynamic Outbound Checkout Footer */}
        {items.length > 0 && activePlatform && (
          <div className="p-4 border-t bg-white dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 font-medium">Selected Store:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {activePlatform.name} (₹{activePlatform.total})
              </span>
            </div>

            <Button
              className="w-full h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 rounded-xl"
              onClick={() => {
                if (activePlatform.checkoutUrl && activePlatform.checkoutUrl !== "#") {
                  window.open(activePlatform.checkoutUrl, "_blank")
                }
              }}
            >
              <span>Proceed to {activePlatform.name}</span>
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}