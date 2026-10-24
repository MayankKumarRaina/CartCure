'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, ChevronDown, RefreshCw, ScanLine, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { CATEGORIES, MEDICINES, PLATFORMS, type Category, type Medicine, type PharmacyPrice } from '@/lib/data'
import { useCart } from '@/components/cart-provider'
import LoadingResearcher from '@/components/loading-researcher'
import { MedicineCard } from '@/components/medicine-card'
import { mapMedicine } from '@/lib/medicines'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const MedicineScannerModal = lazy(() => import('@/components/medicine-scanner-modal').then(
  ({ MedicineScannerModal: ScannerModal }) => ({ default: ScannerModal }),
))

const INITIAL_MEDICINE_LIMIT = 50
const APPEND_MEDICINE_LIMIT = 10
const BROWSE_MEDICINE_CAP = 120
const LIVE_PRICE_PAGE_SIZE = 50
const MEDICINE_CACHE_KEY = 'dawadaam_cached_popular_v1'

type CatalogMedicine = ReturnType<typeof mapMedicine>
type SortMode = 'lowest-price' | 'most-popular' | 'highest-savings' | 'name'
type PendingLivePage = {
  category: Category | null
  searchTerm: string | null
  medicines: CatalogMedicine[]
}

type MedicineCache = {
  popular: CatalogMedicine[]
  categories: Partial<Record<Category, CatalogMedicine[]>>
}

type FailedLoad =
  | { type: 'browse'; category: Category | null }
  | { type: 'search'; term: string }
  | { type: 'autocomplete' }
  | { type: 'append' }
  | { type: 'live-page' }

async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 900,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    try {
      return await fetcher()
    } catch (error) {
      lastError = error
      if (signal?.aborted || attempt === maxAttempts) break
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          window.clearTimeout(timeout)
          signal?.removeEventListener('abort', onAbort)
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        const timeout = window.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, baseDelayMs * 2 ** (attempt - 1))
        signal?.addEventListener('abort', onAbort, { once: true })
        if (signal?.aborted) onAbort()
      })
    }
  }
  throw lastError
}

function isCachedCatalogMedicine(value: unknown): value is CatalogMedicine {
  if (typeof value !== 'object' || value === null) return false
  const medicine = value as Partial<CatalogMedicine>
  return typeof medicine.id === 'string'
    && typeof medicine.name === 'string'
    && typeof medicine.mrp === 'number'
    && Array.isArray(medicine.categories)
    && typeof medicine.prices === 'object'
    && medicine.prices !== null
    && Object.values(medicine.prices).every((price) => typeof price === 'number' && Number.isFinite(price))
}

function readMedicineCache(): MedicineCache {
  try {
    const cached = localStorage.getItem(MEDICINE_CACHE_KEY)
    if (!cached) return { popular: [], categories: {} }
    const parsed: unknown = JSON.parse(cached)
    if (typeof parsed !== 'object' || parsed === null) return { popular: [], categories: {} }

    const value = parsed as Partial<MedicineCache>
    const categories: MedicineCache['categories'] = {}
    if (typeof value.categories === 'object' && value.categories !== null) {
      for (const category of CATEGORIES) {
        const entries = value.categories[category]
        if (Array.isArray(entries)) {
          categories[category] = entries.filter(isCachedCatalogMedicine).slice(0, 20)
        }
      }
    }
    return {
      popular: Array.isArray(value.popular) ? value.popular.filter(isCachedCatalogMedicine).slice(0, 20) : [],
      categories,
    }
  } catch (cacheError) {
    console.warn('Unable to read cached DawaDaam medicines:', cacheError)
    return { popular: [], categories: {} }
  }
}

function cacheMedicines(category: Category | null, medicines: CatalogMedicine[]) {
  try {
    const cache = readMedicineCache()
    if (category) cache.categories[category] = medicines.slice(0, 20)
    else cache.popular = medicines.slice(0, 20)
    localStorage.setItem(MEDICINE_CACHE_KEY, JSON.stringify(cache))
  } catch (cacheError) {
    console.warn('Unable to cache DawaDaam medicines:', cacheError)
  }
}

function searchFilter(term: string) {
  const safeTerm = term.replace(/[(),"]/g, ' ').replace(/[\\%_]/g, '\\$&').trim()
  const pattern = `%${safeTerm}%`
  return `brand_name.ilike.${pattern},salt_composition.ilike.${pattern}`
}

async function mapMedicinesWithCachedPrices(rows: Medicine[]): Promise<CatalogMedicine[]> {
  if (rows.length === 0) return []
  const prices = await fetchWithRetry(async () => {
    const { data, error } = await supabase
      .from('pharmacy_prices')
      .select('medicine_id, platform_name, price, updated_at')
      .in('medicine_id', rows.map(({ id }) => id))
    if (error) throw error
    return data
  })

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
  const [sortMode, setSortMode] = useState<SortMode>('lowest-price')
  const [isBrowseLoading, setIsBrowseLoading] = useState(true)
  const [isAppending, setIsAppending] = useState(false)
  const [isLoadingLivePage, setIsLoadingLivePage] = useState(false)
  const [hasMoreBrowseMedicines, setHasMoreBrowseMedicines] = useState(true)
  const [isDataLoaded, setIsDataLoaded] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [livePageError, setLivePageError] = useState<string | null>(null)
  const [loadingSelectedMedicine, setLoadingSelectedMedicine] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const browseSentinelRef = useRef<HTMLDivElement>(null)
  const operationId = useRef(0)
  const searchRequestId = useRef(0)
  const browseLoadingRef = useRef(false)
  const livePageLoadingRef = useRef(false)
  const pendingLivePageRef = useRef<PendingLivePage | null>(null)
  const failedLoadRef = useRef<FailedLoad | null>(null)
  const retryOnResumeRef = useRef(false)
  const retryRunningRef = useRef(false)
  const retryAutocompleteRef = useRef<(() => Promise<void>) | null>(null)

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

  const loadBrowse = useCallback(async (category: Category | null, keepCurrentResults = false) => {
    const currentOperation = ++operationId.current
    retryOnResumeRef.current = false
    const cache = readMedicineCache()
    const cachedMedicines = category
      ? cache.categories[category] ?? []
      : cache.popular
    if (cachedMedicines.length > 0) registerMedicines(cachedMedicines)
    setSubmittedSearch(null)
    setQuery('')
    setSearchResults([])
    setSelectedMedicine(null)
    if (!keepCurrentResults || cachedMedicines.length > 0) {
      setBrowseMedicines(cachedMedicines)
    }
    pendingLivePageRef.current = null
    setHasMoreBrowseMedicines(true)
    setActiveCategory(category)
    setError(null)
    setLivePageError(null)
    setIsDataLoaded(false)
    setIsBrowseLoading(true)

    try {
      const normalizedCategory = category?.trim() ?? null
      const rows = await fetchWithRetry(async () => {
        let medicinesQuery = supabase.from('medicines').select('*')
        if (normalizedCategory) {
          medicinesQuery = medicinesQuery.ilike('category', normalizedCategory)
        } else {
          medicinesQuery = medicinesQuery.in('category', CATEGORIES)
        }
        const { data, error: queryError } = await medicinesQuery
          .order('search_count', { ascending: false })
          .order('id', { ascending: true })
          .range(0, INITIAL_MEDICINE_LIMIT - 1)
        if (queryError) throw queryError
        return data
      })
      if (currentOperation !== operationId.current) return

      const medicines = await mapMedicinesWithCachedPrices(rows)
      if (currentOperation !== operationId.current) return
      registerMedicines(medicines)
      setBrowseMedicines(medicines)
      cacheMedicines(category, medicines)
      failedLoadRef.current = null
      retryOnResumeRef.current = false
      setHasMoreBrowseMedicines(medicines.length === INITIAL_MEDICINE_LIMIT)
      setIsDataLoaded(true)
    } catch (browseError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to load ${category ?? 'popular'} medicines:`,
          browseError instanceof Error ? browseError.message : JSON.stringify(browseError),
        )
        if (cachedMedicines.length === 0) {
          const fallback = category
            ? MEDICINES.filter((medicine) => medicine.categories.includes(category))
            : MEDICINES
          setBrowseMedicines(fallback.length > 0 ? fallback : MEDICINES)
        }
        setHasMoreBrowseMedicines(false)
        failedLoadRef.current = { type: 'browse', category }
        retryOnResumeRef.current = true
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
    retryAutocompleteRef.current = null
    if (failedLoadRef.current?.type === 'autocomplete') {
      failedLoadRef.current = null
      retryOnResumeRef.current = false
    }
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
      const [brandRows, saltRows] = await fetchWithRetry(async () => {
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
        return [brandResult.data, saltResult.data] as const
      }, 3, 900, controller.signal)
      if (currentSearch !== searchRequestId.current) return

      const uniqueRows = new Map<string, Medicine>()
      for (const row of [...brandRows, ...saltRows]) uniqueRows.set(row.id, row)
      setSearchResults([...uniqueRows.values()].slice(0, 8))
      setError(null)
      if (failedLoadRef.current?.type === 'autocomplete') {
        failedLoadRef.current = null
        retryOnResumeRef.current = false
      }
    }

    void searchMedicines()
      .catch((searchError: unknown) => {
        if (controller.signal.aborted || currentSearch !== searchRequestId.current) return
        console.error(
          'Unable to search Supabase medicines:',
          searchError instanceof Error ? searchError.message : JSON.stringify(searchError),
        )
        failedLoadRef.current = { type: 'autocomplete' }
        retryOnResumeRef.current = true
        retryAutocompleteRef.current = () => searchMedicines()
        setError('Medicine search is temporarily unavailable. Please try again.')
      })
      .finally(() => {
        if (currentSearch === searchRequestId.current) setSearching(false)
      })

    return () => controller.abort()
  }, [query, submittedSearch])

  const submitSearch = useCallback(async (value: string, keepCurrentResults = false) => {
    const term = value.trim()
    if (!term) return

    const currentOperation = ++operationId.current
    retryOnResumeRef.current = false
    setSubmittedSearch(term)
    setSearchResults([])
    setSelectedMedicine(null)
    setActiveCategory(null)
    if (!keepCurrentResults) setBrowseMedicines([])
    pendingLivePageRef.current = null
    setHasMoreBrowseMedicines(true)
    setError(null)
    setLivePageError(null)
    setIsDataLoaded(false)
    setIsBrowseLoading(true)

    try {
      const rows = await fetchWithRetry(async () => {
        const { data, error: queryError } = await supabase
          .from('medicines')
          .select('*')
          .or(searchFilter(term))
          .order('search_count', { ascending: false })
          .order('id', { ascending: true })
          .range(0, INITIAL_MEDICINE_LIMIT - 1)
        if (queryError) throw queryError
        return data
      })
      if (currentOperation !== operationId.current) return

      const medicines = await mapMedicinesWithCachedPrices(rows)
      if (currentOperation !== operationId.current) return
      registerMedicines(medicines)
      setBrowseMedicines(medicines)
      setHasMoreBrowseMedicines(medicines.length === INITIAL_MEDICINE_LIMIT)
      failedLoadRef.current = null
      retryOnResumeRef.current = false
    } catch (searchError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to load search results for "${term}":`,
          searchError instanceof Error ? searchError.message : JSON.stringify(searchError),
        )
        failedLoadRef.current = { type: 'search', term }
        retryOnResumeRef.current = true
        if (browseMedicines.length === 0) setBrowseMedicines(MEDICINES)
        setHasMoreBrowseMedicines(false)
        setError('We could not load these search results right now. Please try again.')
      }
    } finally {
      if (currentOperation === operationId.current) setIsBrowseLoading(false)
    }
  }, [browseMedicines.length, registerMedicines])

  function searchScannedCandidate(candidate: string) {
    const term = candidate.trim()
    if (!term) return
    setIsScannerOpen(false)
    updateQuery(term)
    void submitSearch(term)
  }

  const appendBrowseMedicines = useCallback(async () => {
    if (
      browseLoadingRef.current
      || (!activeCategory && !submittedSearch)
      || !hasMoreBrowseMedicines
      || browseMedicines.length >= BROWSE_MEDICINE_CAP
    ) return

    browseLoadingRef.current = true
    retryOnResumeRef.current = false
    setIsAppending(true)
    setError(null)
    const currentOperation = operationId.current
    const offset = browseMedicines.length
    try {
      const rows = await fetchWithRetry(async () => {
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
        return data
      })
      if (currentOperation !== operationId.current) return

      const nextPage = await mapMedicinesWithCachedPrices(rows)
      if (currentOperation !== operationId.current) return
      setBrowseMedicines((current) => [...current, ...nextPage].slice(0, BROWSE_MEDICINE_CAP))
      cacheMedicines(activeCategory, [...browseMedicines, ...nextPage])
      registerMedicines(nextPage)
      setHasMoreBrowseMedicines(nextPage.length === APPEND_MEDICINE_LIMIT)
      failedLoadRef.current = null
      retryOnResumeRef.current = false
    } catch (appendError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to append ${activeCategory ?? `search "${submittedSearch}"`} medicines:`,
          appendError instanceof Error ? appendError.message : JSON.stringify(appendError),
        )
        failedLoadRef.current = { type: 'append' }
        retryOnResumeRef.current = true
        setError('Unable to load more medicines. Please try again.')
      }
    } finally {
      browseLoadingRef.current = false
      if (currentOperation === operationId.current) setIsAppending(false)
    }
  }, [activeCategory, browseMedicines, hasMoreBrowseMedicines, registerMedicines, submittedSearch])

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
    retryOnResumeRef.current = false
    setIsLoadingLivePage(true)
    setLivePageError(null)
    setError(null)
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
        const rows = await fetchWithRetry(async () => {
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
          return data
        })
        if (currentOperation !== operationId.current) return

        nextPage = await mapMedicinesWithCachedPrices(rows)
        if (currentOperation !== operationId.current) return
        if (nextPage.length === 0) {
          setHasMoreBrowseMedicines(false)
          setLivePageError('There are no more matching medicines.')
          return
        }
        pendingLivePageRef.current = { category: activeCategory, searchTerm: submittedSearch, medicines: nextPage }
        registerMedicines(nextPage)
        setBrowseMedicines((current) => [...current, ...nextPage])
        cacheMedicines(activeCategory, [...browseMedicines, ...nextPage])
        setHasMoreBrowseMedicines(nextPage.length === LIVE_PRICE_PAGE_SIZE)
        failedLoadRef.current = null
        retryOnResumeRef.current = false
      }

      await resolveLivePricesBatch(nextPage)
      pendingLivePageRef.current = null
    } catch (loadError) {
      if (currentOperation === operationId.current) {
        console.error(
          `Unable to load more ${activeCategory ?? `search "${submittedSearch}"`} live prices:`,
          loadError instanceof Error ? loadError.message : JSON.stringify(loadError),
        )
        failedLoadRef.current = { type: 'live-page' }
        retryOnResumeRef.current = true
        setLivePageError('Unable to refresh prices for these medicines. Please try again.')
      }
    } finally {
      livePageLoadingRef.current = false
      if (currentOperation === operationId.current) setIsLoadingLivePage(false)
    }
  }, [activeCategory, browseMedicines, registerMedicines, resolveLivePricesBatch, submittedSearch])

  useEffect(() => {
    const retryFailedLoad = () => {
      if (!retryOnResumeRef.current || retryRunningRef.current) return
      const failedLoad = failedLoadRef.current
      if (!failedLoad) return

      retryRunningRef.current = true
      retryOnResumeRef.current = false
      setError(null)
      setLivePageError(null)
      let retry: Promise<void> = Promise.resolve()
      switch (failedLoad.type) {
        case 'browse':
          retry = loadBrowse(failedLoad.category, true)
          break
        case 'search':
          retry = submitSearch(failedLoad.term, true)
          break
        case 'autocomplete':
          setSearching(true)
          retry = (retryAutocompleteRef.current?.() ?? Promise.resolve())
            .finally(() => setSearching(false))
          break
        case 'append':
          retry = appendBrowseMedicines()
          break
        case 'live-page':
          retry = loadNextLivePricePage()
          break
      }
      void retry.catch((retryError: unknown) => {
        console.error(
          'Unable to retry medicine loading after reconnect:',
          retryError instanceof Error ? retryError.message : JSON.stringify(retryError),
        )
        retryOnResumeRef.current = true
        if (failedLoad.type === 'autocomplete') {
          setError('Medicine search is temporarily unavailable. Please try again.')
        }
      }).finally(() => {
        retryRunningRef.current = false
      })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') retryFailedLoad()
    }
    window.addEventListener('online', retryFailedLoad)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('online', retryFailedLoad)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [appendBrowseMedicines, loadBrowse, loadNextLivePricePage, submitSearch])

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
  const sortedBrowseMedicines = useMemo(() => {
    const medicines = [...browseMedicines]
    const lowestPrice = (medicine: CatalogMedicine) => {
      const prices = PLATFORMS
        .filter(({ id }) => medicine.prices[id] > 0
          && (medicine.livePricePlatforms === undefined || medicine.livePricePlatforms.includes(id)))
        .map(({ id }) => medicine.prices[id])
      return prices.length > 0 ? Math.min(...prices) : Number.POSITIVE_INFINITY
    }

    if (sortMode === 'lowest-price') medicines.sort((a, b) => lowestPrice(a) - lowestPrice(b))
    if (sortMode === 'highest-savings') {
      medicines.sort((a, b) => (b.mrp - lowestPrice(b)) - (a.mrp - lowestPrice(a)))
    }
    if (sortMode === 'name') medicines.sort((a, b) => a.name.localeCompare(b.name))
    return medicines
  }, [browseMedicines, sortMode])

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
              className="h-14 w-full rounded-2xl border bg-card pl-11 pr-24 text-[15px] text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => updateQuery('')}
                aria-label="Clear medicine search"
                className="absolute right-12 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-white"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              title="Scan medicine strip or box"
              aria-label="Scan medicine strip or box"
              onClick={() => setIsScannerOpen(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-emerald-400"
            >
              <ScanLine className="size-5" aria-hidden="true" />
            </button>
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

      <div className="relative my-3 grid grid-cols-2 items-center gap-3" role="group" aria-label="Filter and sort medicines">
        <label className="relative flex min-w-0 items-center">
          <SlidersHorizontal className="pointer-events-none absolute left-3 size-4 text-slate-500 dark:text-slate-300" aria-hidden="true" />
          <span className="sr-only">Filter by category</span>
          <select
            value={activeCategory ?? ''}
            onChange={(event) => {
              const value = event.target.value
              if (value === '' || value === '__clear__') {
                void loadBrowse(null)
              } else if (CATEGORIES.includes(value as Category)) {
                void loadBrowse(value as Category)
              }
            }}
            className="h-11 w-full min-w-0 appearance-none rounded-full border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
          >
            <option value="">All medicines</option>
            {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            <option value="__clear__">Clear category filter</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-slate-500 dark:text-slate-300" aria-hidden="true" />
        </label>
        <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        <label className="relative flex min-w-0 items-center">
          <ArrowUpDown className="pointer-events-none absolute left-3 size-4 text-slate-500 dark:text-slate-300" aria-hidden="true" />
          <span className="sr-only">Sort medicines</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-11 w-full min-w-0 appearance-none rounded-full border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
          >
            <option value="lowest-price">Sort: Lowest price</option>
            <option value="most-popular">Sort: Most popular</option>
            <option value="highest-savings">Sort: Highest savings</option>
            <option value="name">Sort: Name (A–Z)</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-slate-500 dark:text-slate-300" aria-hidden="true" />
        </label>
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
      ) : isBrowseLoading && browseMedicines.length === 0 ? (
        <div className="space-y-4">
          <p className="pt-4 text-center text-sm text-muted-foreground" role="status">
            {submittedSearch ? `Searching for "${submittedSearch}"...` : 'Loading popular medicines...'}
          </p>
          <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
              </div>
            ))}
          </div>
        </div>
      ) : browseMedicines.length > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {sortedBrowseMedicines.map((medicine) => (
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
      {isScannerOpen && (
        <Suspense fallback={null}>
          <MedicineScannerModal
            onClose={() => setIsScannerOpen(false)}
            onSelect={searchScannedCandidate}
          />
        </Suspense>
      )}
    </section>
  )
}
