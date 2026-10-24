'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, FileText, Minus, Plus, ShoppingCart } from 'lucide-react'
import { PLATFORMS, type CatalogMedicine, type Platform, type PlatformId } from '@/lib/data'
import { formatINR } from '@/lib/pricing'
import { useCart } from '@/components/cart-provider'
import { getAffiliateUrl, WELLNESS_PARTNERS } from '@/lib/affiliates'
import { cn } from '@/lib/utils'

type DosageForm = 'tablet' | 'capsule' | 'liquid' | 'injection' | 'topical' | 'inhaler'

function dosageFormFor(medicine: CatalogMedicine): DosageForm {
  const details = `${medicine.name} ${medicine.pack}`.toLowerCase()
  if (/capsule|\bcap\b/.test(details)) return 'capsule'
  if (/syrup|suspension|liquid|infusion|drops?/.test(details)) return 'liquid'
  if (/injection|\bvial\b/.test(details)) return 'injection'
  if (/cream|gel|ointment/.test(details)) return 'topical'
  if (/inhaler/.test(details)) return 'inhaler'
  return 'tablet'
}

function DosageIllustration({ form }: { form: DosageForm }) {
  if (form === 'capsule') {
    return (
      <svg viewBox="0 0 56 56" className="size-11" role="img" aria-label="Capsule">
        <defs>
          <linearGradient id="capsule-red" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#ff7777" />
            <stop offset="1" stopColor="#b91c35" />
          </linearGradient>
          <linearGradient id="capsule-white" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#fff" />
            <stop offset="1" stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
        <g transform="rotate(-38 28 28)">
          <rect x="17" y="11" width="22" height="34" rx="11" fill="url(#capsule-red)" />
          <path d="M17 28h22v6a11 11 0 0 1-22 0z" fill="url(#capsule-white)" />
          <path d="M20 17a8 8 0 0 1 13-2" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 28h20" stroke="#94a3b8" strokeOpacity=".7" />
        </g>
      </svg>
    )
  }

  if (form === 'liquid') {
    return (
      <svg viewBox="0 0 56 56" className="size-11" role="img" aria-label="Syrup bottle">
        <defs>
          <linearGradient id="syrup-glass" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#fbbf24" />
            <stop offset=".55" stopColor="#b45309" />
            <stop offset="1" stopColor="#78350f" />
          </linearGradient>
        </defs>
        <path d="M22 8h12v7l4 5v25a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3V20l4-5z" fill="url(#syrup-glass)" stroke="#fcd34d" strokeWidth="1.4" />
        <path d="M21 25h14v10H21z" rx="2" fill="#fef3c7" />
        <path d="M23 11h10v4H23z" rx="1" fill="#e2e8f0" />
        <path d="M22 22h12" stroke="#fff" strokeOpacity=".6" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M21 39h14" stroke="#fbbf24" strokeOpacity=".8" strokeWidth="2" />
      </svg>
    )
  }

  if (form === 'injection') {
    return (
      <svg viewBox="0 0 56 56" className="size-11" role="img" aria-label="Medicine vial">
        <path d="M23 10h10v7l4 4v23a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V21l4-4z" fill="#dbeafe" fillOpacity=".9" stroke="#93c5fd" strokeWidth="1.5" />
        <path d="M22 29h12v11H22z" fill="#60a5fa" fillOpacity=".7" />
        <path d="M22 13h12v4H22z" rx="1" fill="#f8fafc" stroke="#94a3b8" />
        <path d="M28 4v6m-3-3h6" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 23h12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  if (form === 'topical') {
    return (
      <svg viewBox="0 0 56 56" className="size-11" role="img" aria-label="Cream tube">
        <defs>
          <linearGradient id="tube" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#f8fafc" />
            <stop offset="1" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <path d="m17 13 23 3-5 27-18-2z" fill="url(#tube)" stroke="#cbd5e1" strokeWidth="1.3" />
        <path d="m19 20 18 2-2 10-18-2z" fill="#38bdf8" />
        <path d="m17 41 18 2-1 5-16-2z" fill="#e2e8f0" stroke="#94a3b8" />
        <path d="m22 17 12 2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  if (form === 'inhaler') {
    return (
      <svg viewBox="0 0 56 56" className="size-11" role="img" aria-label="Inhaler">
        <path d="M21 13h17a3 3 0 0 1 3 3v7H24v20a3 3 0 0 1-3 3h-3V20a7 7 0 0 1 3-7z" fill="#22c55e" stroke="#86efac" strokeWidth="1.5" />
        <path d="M24 23h17v8H24z" fill="#f8fafc" />
        <path d="M27 17h9" stroke="#dcfce7" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 46h-6v-5h9" fill="#cbd5e1" stroke="#94a3b8" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 56 56" className="size-10 sm:size-11" role="img" aria-label="Tablets">
      <defs>
        <linearGradient id="tablet" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#fff" />
          <stop offset=".56" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
        <radialGradient id="tablet-shine" cx=".28" cy=".22" r=".8">
          <stop stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="rotate(-24 28 28)" stroke="#e2e8f0" strokeWidth=".8">
        <circle cx="17" cy="19" r="9" fill="url(#tablet)" />
        <circle cx="36" cy="19" r="9" fill="url(#tablet)" />
        <circle cx="27" cy="36" r="9" fill="url(#tablet)" />
        <circle cx="17" cy="19" r="8" fill="url(#tablet-shine)" stroke="none" />
        <circle cx="36" cy="19" r="8" fill="url(#tablet-shine)" stroke="none" />
        <circle cx="27" cy="36" r="8" fill="url(#tablet-shine)" stroke="none" />
      </g>
    </svg>
  )
}

const BRAND_STYLES: Record<PlatformId, string> = {
  apollo: 'bg-[#E03C31] text-white',
  tata1mg: 'bg-[#6F2DBD] text-white',
  netmeds: 'bg-white text-[#24AEB1]',
  pharmeasy: 'bg-[#10847E] text-white',
  truemeds: 'bg-[#1E40AF] text-white',
}

function pharmacyUrl(platform: Platform, medicine: CatalogMedicine) {
  return getAffiliateUrl(platform.id, medicine.productUrls?.[platform.id] ?? platform.searchUrl(medicine.name))
}

export function MedicineCard({ medicine }: { medicine: CatalogMedicine }) {
  const { items, add, increment, decrement, loadingPriceIds, resolveLivePrices } = useCart()
  const qty = items[medicine.id] ?? 0
  const isPriceLoading = loadingPriceIds.has(medicine.id)
  const pricedPlatforms = PLATFORMS.filter(({ id }) => (
    medicine.prices[id] > 0
    && (medicine.livePricePlatforms === undefined || medicine.livePricePlatforms.includes(id))
  )).sort((a, b) => medicine.prices[a.id] - medicine.prices[b.id])
  const winner = pricedPlatforms[0]
  const runnerUps = PLATFORMS.filter(({ id }) => id !== winner?.id).slice(0, 3)
  const totalStoreCount = PLATFORMS.length + WELLNESS_PARTNERS.length
  const [isExpanded, setIsExpanded] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = cardRef.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') {
      void resolveLivePrices(medicine).catch((error: unknown) => {
        console.error(`Unable to refresh prices for ${medicine.id}:`, error)
      })
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        void resolveLivePrices(medicine).catch((error: unknown) => {
          console.error(`Unable to refresh prices for ${medicine.id}:`, error)
        })
      }
    }, { rootMargin: '80px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [medicine, resolveLivePrices])

  function showOffers() {
    void resolveLivePrices(medicine).catch((error: unknown) => {
      console.error(`Unable to refresh prices for ${medicine.id}:`, error)
    })
  }

  function toggleComparison() {
    setIsExpanded((current) => !current)
    if (!winner) showOffers()
  }

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
      className="box-border flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-4"
      aria-labelledby={`${medicine.id}-title`}
    >
      <div className="box-border flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/90 sm:size-12">
          <DosageIllustration form={dosageFormFor(medicine)} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 id={`${medicine.id}-title`} className="line-clamp-1 text-[13.5px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100 sm:text-[15px]">
            {medicine.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-normal leading-tight text-slate-500 dark:text-slate-400">
            {medicine.pack} <span aria-hidden="true">·</span> {medicine.manufacturer}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium leading-tight text-slate-600 dark:text-slate-300">{medicine.salt}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end pt-0.5 text-right">
          {medicine.rxRequired && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-200">
              <FileText className="size-3" aria-hidden="true" />
              RX
            </span>
          )}
          <span className="mt-1 text-[11px] font-medium text-slate-400">MRP {formatINR(medicine.mrp)}</span>
        </div>
      </div>

      <div className="box-border mt-3 flex w-full min-w-0 max-w-full items-stretch gap-2 overflow-hidden">
        {winner ? (
          <a
            href={pharmacyUrl(winner, medicine)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${medicine.name} at ${winner.name} for ${formatINR(medicine.prices[winner.id])}`}
            className="flex min-w-0 flex-1 items-center justify-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-50/70 px-3 py-2 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/35 dark:hover:bg-emerald-950/70"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="text-[17px] font-extrabold leading-none text-emerald-600 dark:text-emerald-400 sm:text-lg">
                  {formatINR(medicine.prices[winner.id])}
                </span>
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-slate-950">
                  Lowest
                </span>
              </span>
              <span className="mt-1 block truncate text-[10.5px] font-medium text-emerald-700/90 dark:text-emerald-400/90">
                Save {formatINR(Math.max(0, medicine.mrp - medicine.prices[winner.id]))} vs MRP
              </span>
            </span>
            <span className="mx-1 h-7 w-px shrink-0 bg-emerald-500/30" aria-hidden="true" />
            <span className="min-w-0 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span className="truncate">{winner.shortName}</span>
            </span>
          </a>
        ) : (
          <button
            type="button"
            onClick={showOffers}
            aria-busy={isPriceLoading}
            className="flex min-w-0 flex-1 items-center justify-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-50/70 px-3 py-2 text-left dark:bg-emerald-950/35"
          >
            <span>
              <span className="block text-[17px] font-extrabold leading-none text-emerald-600 dark:text-emerald-400 sm:text-lg">
                ₹---
              </span>
              <span className="text-[11px] font-medium text-emerald-700/90 dark:text-emerald-400/90">
                View offers
              </span>
              {isPriceLoading && <span className="sr-only">Checking live prices</span>}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={toggleComparison}
          aria-expanded={isExpanded}
          className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-[11px] font-semibold text-teal-400"
        >
          Compare {totalStoreCount}
          <ChevronDown className={cn('size-3.5 transition-transform', isExpanded && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>

      <div className="box-border mt-2 grid w-full min-w-0 max-w-full grid-cols-[repeat(3,minmax(0,1fr))_46px_auto] items-stretch gap-1.5 overflow-hidden">
        {runnerUps.map((platform) => (
          <a
            key={platform.id}
            href={pharmacyUrl(platform, medicine)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${medicine.name} at ${platform.shortName}`}
            className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 px-1.5 py-1.5"
          >
            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold', BRAND_STYLES[platform.id])}>
              {platform.id === 'tata1mg' ? '1mg' : platform.id === 'netmeds' ? '+' : platform.shortName.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[9.5px] font-medium leading-tight text-slate-400">{platform.shortName}</span>
              <span className="block truncate text-[11px] font-bold leading-tight text-slate-100">
                {medicine.prices[platform.id] > 0 && (medicine.livePricePlatforms === undefined || medicine.livePricePlatforms.includes(platform.id))
                  ? formatINR(medicine.prices[platform.id])
                  : '₹---'}
              </span>
            </span>
          </a>
        ))}
        <button
          type="button"
          onClick={toggleComparison}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-col items-center justify-center whitespace-nowrap rounded-xl border border-slate-800 bg-slate-900/70 px-1 py-1.5 text-[9.5px] font-semibold leading-tight text-slate-300"
        >
          +{Math.max(0, totalStoreCount - (winner ? 4 : 3))} more
        </button>

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
                'inline-flex min-w-0 items-center justify-center gap-1 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-300',
                justAdded && 'bg-emerald-500',
              )}
            >
              {justAdded ? <Check className="size-4" aria-hidden="true" /> : <ShoppingCart className="size-4" aria-hidden="true" />}
              {justAdded ? 'Added' : 'Add'}
            </motion.button>
          ) : (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="flex h-full min-w-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-slate-900"
            >
              <button
                type="button"
                onClick={() => decrement(medicine.id)}
                aria-label={`Decrease ${medicine.name} quantity`}
                className="flex size-6 shrink-0 items-center justify-center rounded-l-xl text-slate-300 hover:bg-slate-800"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <span className="min-w-4 text-center text-xs font-semibold text-white tabular-nums" aria-live="polite">{qty}</span>
              <button
                type="button"
                onClick={() => increment(medicine.id)}
                aria-label={`Increase ${medicine.name} quantity`}
                className="flex size-6 shrink-0 items-center justify-center rounded-r-xl text-emerald-400 hover:bg-slate-800"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3">
              {PLATFORMS.map((platform) => {
                const hasPrice = medicine.prices[platform.id] > 0
                  && (medicine.livePricePlatforms === undefined || medicine.livePricePlatforms.includes(platform.id))
                return (
                  <a
                    key={platform.id}
                    href={pharmacyUrl(platform, medicine)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${medicine.name} at ${platform.name}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold', BRAND_STYLES[platform.id])}>
                        {platform.id === 'tata1mg' ? '1mg' : platform.id === 'netmeds' ? '+' : platform.shortName.slice(0, 2)}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-200">{platform.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-white">
                      {hasPrice ? formatINR(medicine.prices[platform.id]) : isPriceLoading ? 'Checking…' : 'Check Offer →'}
                    </span>
                  </a>
                )
              })}
              {WELLNESS_PARTNERS.map((partner) => (
                <a
                  key={partner.id}
                  href={getAffiliateUrl(partner.id, `https://${partner.id}.com`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-teal-900/70 bg-teal-950/30 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
                      partner.id === 'healthkart' ? 'bg-[#00B5B7]' : 'bg-[#0F766E]',
                    )}>
                      {partner.badge}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-200">{partner.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-[10px] font-semibold text-teal-300">
                    Check Offer →
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}
