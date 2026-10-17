'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, HeartPulse, Droplet, Search, SearchX, Sparkles, X } from 'lucide-react'
import { QUICK_FILTERS, type Category } from '@/lib/data'
import { useCart } from '@/components/cart-provider'
import { MedicineCard } from '@/components/medicine-card'
import { cn } from '@/lib/utils'

const FILTER_ICONS: Record<string, typeof Activity> = {
  Diabetes: Droplet,
  'Blood Pressure': Activity,
  Thyroid: Sparkles,
  'Heart Care': HeartPulse,
}

export function MedicineSearch() {
  const { medicines } = useCart()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Category | null>(null)
  const deferredQuery = useDeferredValue(query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return medicines.filter((m) => {
      const matchesFilter = !filter || m.categories.includes(filter)
      const haystack = `${m.name} ${m.salt} ${m.manufacturer}`.toLowerCase()
      const matchesQuery = !q || q.split(/\s+/).every((token) => haystack.includes(token))
      return matchesFilter && matchesQuery
    })
  }, [deferredQuery, filter, medicines])

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-4">
      <div className="sticky top-14 z-30 -mx-4 bg-background/90 px-3 pb-3 pt-3 backdrop-blur-md sm:px-4">
        <div role="search" className="relative">
          <label htmlFor="medicine-search" className="sr-only">
            Search medicines
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="medicine-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by brand name or salt (e.g. Telma 40, Glycomet GP 1)..."
            className="h-12 w-full rounded-xl border bg-card pl-11 pr-11 text-[15px] text-foreground shadow-sm shadow-slate-900/[0.03] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus:border-primary/50 focus:bg-background focus:ring-4 focus:ring-primary/10 [&::-webkit-search-cancel-button]:hidden"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div
          className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-4 sm:px-4"
          role="group"
          aria-label="Quick filters"
        >
          {QUICK_FILTERS.map((cat) => {
            const Icon = FILTER_ICONS[cat]
            const active = filter === cat
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(active ? null : cat)}
                className={cn(
                  'relative isolate inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:border-slate-300 hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="active-filter"
                    className="absolute inset-0 -z-10 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                  />
                )}
                <Icon className="size-3.5" aria-hidden="true" />
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <h2 id="results-heading" className="text-sm font-semibold">
          {query || filter ? 'Results' : 'Popular chronic medicines'}
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {results.length} {results.length === 1 ? 'medicine' : 'medicines'}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {results.map((m) => (
            <MedicineCard key={m.id} medicine={m} />
          ))}
        </AnimatePresence>
      </div>

      {results.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">No medicines found</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Try a brand like &quot;Thyronorm&quot; or a salt like &quot;Metformin&quot;.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setFilter(null)
            }}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Clear search &amp; filters
          </button>
        </div>
      )}
    </section>
  )
}
