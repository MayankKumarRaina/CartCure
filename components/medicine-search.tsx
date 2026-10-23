'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  Apple,
  Baby,
  Brain,
  Brush,
  Bug,
  Dna,
  Droplet,
  Droplets,
  Ear,
  Eye,
  FlameKindling,
  HeartPulse,
  PackagePlus,
  Pill,
  RefreshCw,
  ScanEye,
  Search,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Syringe,
  Wind,
  Zap,
} from 'lucide-react'
import { CATEGORIES, type Category, type Medicine, type PharmacyPrice } from '@/lib/data'
import { useCart } from '@/components/cart-provider'
import LoadingResearcher from '@/components/loading-researcher'
import { MedicineCard } from '@/components/medicine-card'
import { mapMedicine } from '@/lib/medicines'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const INITIAL_MEDICINE_LIMIT = 50
const APPEND_MEDICINE_LIMIT = 10
const BROWSE_MEDICINE_CAP = 120
const LIVE_PRICE_PAGE_SIZE = 50

const CATEGORY_ICONS: Record<Category, typeof Activity> = {
  'Anti Diabetic': Activity,
  'Anti Infectives': ShieldCheck,
  'Anti Malarials': Bug,
  'Anti Neoplastics': ShieldAlert,
  'Blood Related': Droplet,
  Cardiac: HeartPulse,
  Derma: Sparkles,
  'Gastro Intestinal': Pill,
  Gynaecological: Baby,
  Hormones: Dna,
  'Neuro Cns': Brain,
  Ophthal: Eye,
  'Ophthal Otologicals': ScanEye,
  Others: PackagePlus,
  Otologicals: Ear,
  'Pain Analgesics': Zap,
  Respiratory: Wind,
  'Sex Stimulants Rejuvenators': FlameKindling,
  Stomatologicals: Brush,
  Urology: Droplets,
  Vaccines: Syringe,
  'Vitamins Minerals Nutrients': Apple,
}

type CatalogMedicine = ReturnType<typeof mapMedicine>
type PendingLivePage = {
  category: Category | null
  searchTerm: string | null
  medicines: CatalogMedicine[]
}

function searchFilter(term: string) {
  const safeTerm = term.replace(/[(),"]/g, ' ').replace(/[\\%_]/g, '\\$&').trim()
  const pattern = `%${safeTerm}%`
  return `brand_name.ilike.${pattern},salt_composition.ilike.${pattern}`
}

async function mapMedicinesWithCachedPrices(rows: Medicine[]): Promise<CatalogMedicine[]> {
  if (rows.length === 0) return []
  const { data: prices, error } = await supabase
    .from('pharmacy_prices')
    .select('medicine_id, platform_name, price, updated_at')
    .in('medicine_id', rows.map(({ id }) => id))

  if (error) throw error

  const pricesByMedicine = new Map<string, PharmacyPrice[]>()
  for (const price of prices) {
    const medicinePrices = pricesByMedicine.get(price.medicine_id) ?? []
    medicinePrices.push(price)
    pricesByMedicine.set(price.medicine_id, medicinePrices)
  }

  return rows.map((row) => mapMedicine(row, pricesByMedicine.get(row.id) ?? []))
}

export function MedicineSearch() {
  const {
    medicines: catalogMedicines,
    registerMedicines,
    resolveLivePrices,
    resolveLivePricesBatch,
    recordMedicineSearch,
  } = useCart()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Medicine[]>([])
  const [submittedSearch, setSubmittedSearch] = useState<string | null>(null)
  const [browseMedicines, setBrowseMedicines] = useState<CatalogMedicine[]>([])
  const [selectedMedicine, setSelectedMedicine] = useState<CatalogMedicine | null>(null)
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [isBrowseLoading, setIsBrowseLoading] = useState(true)
  const [isAppending, setIsAppending] = useState(false)
  const [isLoadingLivePage, setIsLoadingLivePage] = useState(false)
  const [hasMoreBrowseMedicines, setHasMoreBrowseMedicines] = useState(true)
  const [isDataLoaded, setIsDataLoaded] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [livePageError, setLivePageError] = useState<string | null>(null)
  const [loadingSelectedMedicine, setLoadingSelectedMedicine] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const browseSentinelRef = useRef<HTMLDivElement>(null)
  const operationId = useRef(0)
  const searchRequestId = useRef(0)
  const browseLoadingRef = useRef(false)
  const livePageLoadingRef = useRef(false)
  const pendingLivePageRef = useRef<PendingLivePage | null>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loadBrowse = useCallback(async (category: Category | null) => {
    const currentOperation = ++operationId.current
    setSubmittedSearch(null)
    setQuery('')
    setSearchResults([])
    setSelectedMedicine(null)
    setBrowseMedicines([])
    pendingLivePageRef.current = null
    setHasMoreBrowseMedicines(true)
    setActiveCategory(category)
    setError(null)
    setLivePageError(null)
    setIsDataLoaded(false)
    setIsBrowseLoading(true)

    try {
      const medicinesQuery = supabase.from('medicines').select('*')
      const normalizedCategory = category?.trim() ?? null
      const result = normalizedCategory
        ? await medicinesQuery
          .ilike('category', normalizedCategory)
          .order('search_count', { ascending: false })
          .order('id', { ascending: true })
          .range(0, INITIAL_MEDICINE_LIMIT - 1)
        : await medicinesQuery
          .in('category', CATEGORIES)
          .order('search_count', { ascending: false })
          .order('id', { ascending: true })
          .range(0, INITIAL_MEDICINE_LIMIT - 1)

      if (result.error) throw result.error
      if (currentOperation !== operationId.current) return

      const medicines = await mapMedicinesWithCachedPrices(result.data)
      if (currentOperation !== operationId.current) return
      registerMedicines(medicines)
      setBrowseMedicines(medicines)
      setHasMoreBrowseMedicines(medicines.length === INITIAL_MEDICINE_LIMIT)
      setIsDataLoaded(true)
    } catch (browseError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to load ${category ?? 'popular'} medicines:`,
          browseError instanceof Error ? browseError.message : JSON.stringify(browseError),
        )
        setError('We could not load these medicines right now. Please try again.')
        setIsDataLoaded(true)
      }
    } finally {
      if (currentOperation === operationId.current) setIsBrowseLoading(false)
    }
  }, [registerMedicines])

  useEffect(() => {
    void loadBrowse(null)
  }, [loadBrowse])

  useEffect(() => {
    const term = query.trim()
    const currentSearch = ++searchRequestId.current
    if (!term || submittedSearch !== null) {
      setSearchResults([])
      setSearching(false)
      return
    }

    const controller = new AbortController()
    setSearching(true)
    setError(null)
    const pattern = `%${term}%`

    async function searchMedicines() {
      const [brandResult, saltResult] = await Promise.all([
        supabase
          .from('medicines')
          .select('*')
          .ilike('brand_name', pattern)
          .order('mrp', { ascending: true })
          .limit(8)
          .abortSignal(controller.signal),
        supabase
          .from('medicines')
          .select('*')
          .ilike('salt_composition', pattern)
          .order('mrp', { ascending: true })
          .limit(8)
          .abortSignal(controller.signal),
      ])

      if (brandResult.error) throw brandResult.error
      if (saltResult.error) throw saltResult.error
      if (currentSearch !== searchRequestId.current) return

      const uniqueRows = new Map<string, Medicine>()
      for (const row of [...brandResult.data, ...saltResult.data]) uniqueRows.set(row.id, row)
      setSearchResults([...uniqueRows.values()].slice(0, 8))
    }

    void searchMedicines()
      .catch((searchError: unknown) => {
        if (controller.signal.aborted || currentSearch !== searchRequestId.current) return
        console.error(
          'Unable to search Supabase medicines:',
          searchError instanceof Error ? searchError.message : JSON.stringify(searchError),
        )
        setError('Medicine search is temporarily unavailable. Please try again.')
      })
      .finally(() => {
        if (currentSearch === searchRequestId.current) setSearching(false)
      })

    return () => controller.abort()
  }, [query, submittedSearch])

  const submitSearch = useCallback(async (value: string) => {
    const term = value.trim()
    if (!term) return

    const currentOperation = ++operationId.current
    setSubmittedSearch(term)
    setSearchResults([])
    setSelectedMedicine(null)
    setActiveCategory(null)
    setBrowseMedicines([])
    pendingLivePageRef.current = null
    setHasMoreBrowseMedicines(true)
    setError(null)
    setLivePageError(null)
    setIsDataLoaded(false)
    setIsBrowseLoading(true)

    try {
      const { data, error: queryError } = await supabase
        .from('medicines')
        .select('*')
        .or(searchFilter(term))
        .order('search_count', { ascending: false })
        .order('id', { ascending: true })
        .range(0, INITIAL_MEDICINE_LIMIT - 1)

      if (queryError) throw queryError
      if (currentOperation !== operationId.current) return

      const medicines = await mapMedicinesWithCachedPrices(data)
      if (currentOperation !== operationId.current) return
      registerMedicines(medicines)
      setBrowseMedicines(medicines)
      setHasMoreBrowseMedicines(medicines.length === INITIAL_MEDICINE_LIMIT)
    } catch (searchError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to load search results for "${term}":`,
          searchError instanceof Error ? searchError.message : JSON.stringify(searchError),
        )
        setError('We could not load these search results right now. Please try again.')
      }
    } finally {
      if (currentOperation === operationId.current) setIsBrowseLoading(false)
    }
  }, [registerMedicines])

  const appendBrowseMedicines = useCallback(async () => {
    if (
      browseLoadingRef.current
      || (!activeCategory && !submittedSearch)
      || !hasMoreBrowseMedicines
      || browseMedicines.length >= BROWSE_MEDICINE_CAP
    ) return

    browseLoadingRef.current = true
    setIsAppending(true)
    const currentOperation = operationId.current
    const offset = browseMedicines.length
    try {
      let medicinesQuery = supabase.from('medicines').select('*')
      if (submittedSearch) {
        medicinesQuery = medicinesQuery.or(searchFilter(submittedSearch))
      } else if (activeCategory) {
        medicinesQuery = medicinesQuery.ilike('category', activeCategory.trim())
      }
      const { data, error: queryError } = await medicinesQuery
        .order('search_count', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + APPEND_MEDICINE_LIMIT - 1)

      if (queryError) throw queryError
      if (currentOperation !== operationId.current) return

      const nextPage = await mapMedicinesWithCachedPrices(data)
      if (currentOperation !== operationId.current) return
      setBrowseMedicines((current) => [...current, ...nextPage].slice(0, BROWSE_MEDICINE_CAP))
      registerMedicines(nextPage)
      setHasMoreBrowseMedicines(nextPage.length === APPEND_MEDICINE_LIMIT)
    } catch (appendError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to append ${activeCategory ?? `search "${submittedSearch}"`} medicines:`,
          appendError instanceof Error ? appendError.message : JSON.stringify(appendError),
        )
        setError('Unable to load more medicines. Please try again.')
      }
    } finally {
      browseLoadingRef.current = false
      if (currentOperation === operationId.current) setIsAppending(false)
    }
  }, [activeCategory, browseMedicines.length, hasMoreBrowseMedicines, registerMedicines, submittedSearch])

  useEffect(() => {
    if ((!activeCategory && !submittedSearch) || !hasMoreBrowseMedicines || browseMedicines.length >= BROWSE_MEDICINE_CAP) return
    const sentinel = browseSentinelRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void appendBrowseMedicines()
    }, { rootMargin: '240px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeCategory, appendBrowseMedicines, browseMedicines.length, hasMoreBrowseMedicines, submittedSearch])

  const loadNextLivePricePage = useCallback(async () => {
    if (
      livePageLoadingRef.current
      || (!activeCategory && !submittedSearch)
      || browseMedicines.length < BROWSE_MEDICINE_CAP
    ) return

    livePageLoadingRef.current = true
    setIsLoadingLivePage(true)
    setLivePageError(null)
    const currentOperation = operationId.current
    try {
      let nextPage: CatalogMedicine[]
      if (
        pendingLivePageRef.current?.category === activeCategory
        && pendingLivePageRef.current.searchTerm === submittedSearch
      ) {
        nextPage = pendingLivePageRef.current.medicines
      } else {
        const offset = browseMedicines.length
        let medicinesQuery = supabase.from('medicines').select('*')
        if (submittedSearch) {
          medicinesQuery = medicinesQuery.or(searchFilter(submittedSearch))
        } else if (activeCategory) {
          medicinesQuery = medicinesQuery.ilike('category', activeCategory.trim())
        }
        const { data, error: queryError } = await medicinesQuery
          .order('search_count', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + LIVE_PRICE_PAGE_SIZE - 1)

        if (queryError) throw queryError
        if (currentOperation !== operationId.current) return

        nextPage = await mapMedicinesWithCachedPrices(data)
        if (currentOperation !== operationId.current) return
        if (nextPage.length === 0) {
          setHasMoreBrowseMedicines(false)
          setLivePageError('There are no more matching medicines.')
          return
        }
        pendingLivePageRef.current = { category: activeCategory, searchTerm: submittedSearch, medicines: nextPage }
        registerMedicines(nextPage)
        setBrowseMedicines((current) => [...current, ...nextPage])
        setHasMoreBrowseMedicines(nextPage.length === LIVE_PRICE_PAGE_SIZE)
      }

      await resolveLivePricesBatch(nextPage)
      pendingLivePageRef.current = null
    } catch (loadError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to load more ${activeCategory ?? `search "${submittedSearch}"`} live prices:`,
          loadError instanceof Error ? loadError.message : JSON.stringify(loadError),
        )
        setLivePageError('Unable to refresh prices for these medicines. Please try again.')
      }
    } finally {
      livePageLoadingRef.current = false
      if (currentOperation === operationId.current) setIsLoadingLivePage(false)
    }
  }, [activeCategory, browseMedicines.length, registerMedicines, resolveLivePricesBatch, submittedSearch])

  async function selectMedicine(row: Medicine) {
    const currentOperation = ++operationId.current
    const fallbackMedicine = mapMedicine(row, [])
    recordMedicineSearch(row.id)
    setQuery('')
    setSearchResults([])
    setSubmittedSearch(null)
    setBrowseMedicines([])
    setSelectedMedicine(fallbackMedicine)
    setActiveCategory(null)
    setError(null)
    registerMedicines([fallbackMedicine])
    setIsDataLoaded(false)
    setLoadingSelectedMedicine(true)

    try {
      const [medicine] = await mapMedicinesWithCachedPrices([row])
      if (currentOperation !== operationId.current) return
      setSelectedMedicine(medicine)
      registerMedicines([medicine])
      await resolveLivePrices(medicine)
      if (currentOperation === operationId.current) setIsDataLoaded(true)
    } catch {
      if (currentOperation === operationId.current) {
        setError('We could not refresh this medicine’s prices. You can retry by adding it to your basket.')
        setIsDataLoaded(true)
      }
    }
  }

  function finishLoadingAnimation() {
    if (isDataLoaded) setLoadingSelectedMedicine(false)
  }

  function updateQuery(value: string) {
    operationId.current += 1
    setQuery(value)
    setSubmittedSearch(null)
    setBrowseMedicines([])
    pendingLivePageRef.current = null
    setSelectedMedicine(null)
    setActiveCategory(null)
    setIsBrowseLoading(false)
    setLoadingSelectedMedicine(false)
    setIsDataLoaded(false)
    setError(null)
    setLivePageError(null)
  }

  const visibleSearchResults = query.trim() && submittedSearch === null ? searchResults : []
  const selectedCatalogMedicine = selectedMedicine
    ? catalogMedicines.find(({ id }) => id === selectedMedicine.id) ?? selectedMedicine
    : null

  return (
    <section className="flex flex-col gap-6" aria-label="Find and compare medicines">
      <div className="sticky top-14 z-30 -mx-4 border-b border-transparent bg-background/95 px-3 py-2.5 backdrop-blur-md sm:px-4">
        <div className="relative">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              void submitSearch(query)
            }}
          >
            <label htmlFor="medicine-search" className="sr-only">Search medicines</label>
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
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Search medicines"
              className="h-14 w-full rounded-2xl border bg-card pl-11 pr-4 text-[15px] text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 [&::-webkit-search-cancel-button]:hidden"
            />
          </form>

          {visibleSearchResults.length > 0 && (
            <ul className="absolute inset-x-0 top-[calc(100%-0.5rem)] z-40 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg" aria-label="Medicine suggestions">
              {visibleSearchResults.map((medicine) => (
                <li key={medicine.id}>
                  <button
                    type="button"
                    onClick={() => void selectMedicine(medicine)}
                    className="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="text-sm font-medium">{medicine.brand_name}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {medicine.salt_composition || 'Composition not listed'} · MRP ₹{medicine.mrp}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className="-mx-3 -mt-3 flex flex-wrap items-center gap-2 px-3 sm:-mx-4 sm:px-4"
        role="group"
        aria-label="Medicine categories"
      >
        {CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category]
          const isActive = activeCategory === category
          return (
            <button
              key={category}
              type="button"
              aria-pressed={isActive}
              onClick={() => void loadBrowse(isActive ? null : category)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:border-slate-300 hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {category}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!selectedCatalogMedicine && !loadingSelectedMedicine && (submittedSearch || !query.trim()) && (
        <h2 className="text-lg font-semibold">
          {submittedSearch ? `Results for "${submittedSearch}"` : activeCategory ?? 'Popular chronic medicines'}
        </h2>
      )}

      {loadingSelectedMedicine ? (
        <LoadingResearcher
          isDataLoaded={isDataLoaded}
          onAnimationComplete={finishLoadingAnimation}
          message="Researching live prices across pharmacies..."
        />
      ) : selectedCatalogMedicine ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Price comparison</h2>
          <MedicineCard medicine={selectedCatalogMedicine} />
        </div>
      ) : isBrowseLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {submittedSearch ? `Searching for "${submittedSearch}"...` : 'Loading popular medicines...'}
        </p>
      ) : browseMedicines.length > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {browseMedicines.map((medicine) => (
              <MedicineCard
                key={medicine.id}
                medicine={catalogMedicines.find(({ id }) => id === medicine.id) ?? medicine}
              />
            ))}
          </div>

          {(activeCategory || submittedSearch) && browseMedicines.length < BROWSE_MEDICINE_CAP && hasMoreBrowseMedicines && (
            <div ref={browseSentinelRef} className="flex min-h-12 items-center justify-center text-xs text-muted-foreground" aria-live="polite">
              {isAppending ? 'Loading more medicines...' : 'Scroll for more medicines'}
            </div>
          )}

          {(activeCategory || submittedSearch) && browseMedicines.length >= BROWSE_MEDICINE_CAP && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-4 text-center">
              {livePageError && <p className="text-sm text-destructive" role="alert">{livePageError}</p>}
              {hasMoreBrowseMedicines ? (
                <button
                  type="button"
                  onClick={() => void loadNextLivePricePage()}
                  disabled={isLoadingLivePage}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary/60 disabled:cursor-wait disabled:opacity-70"
                >
                  {isLoadingLivePage
                    ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                    : <span className="text-base" aria-hidden="true">↑</span>}
                  {isLoadingLivePage ? 'Loading medicines and live prices...' : 'Swipe up to load more live prices'}
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">You’ve reached the end of these results.</p>
              )}
            </div>
          )}
        </>
      ) : query.trim() && submittedSearch === null ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">
            {visibleSearchResults.length > 0
              ? 'Choose a medicine from the suggestions above'
              : searching
                ? 'Searching medicines...'
                : 'No medicines found'}
          </p>
          {visibleSearchResults.length === 0 && (
            <p className="max-w-xs text-xs text-muted-foreground">Search by a brand name or medicine salt.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">
            {error ? 'Unable to display medicines' : 'No medicines found'}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => {
                if (submittedSearch) void submitSearch(submittedSearch)
                else void loadBrowse(activeCategory)
              }}
              className="text-sm font-medium text-primary hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  )
}
