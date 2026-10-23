'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PLATFORMS, MEDICINES } from '@/lib/data'
import type { CatalogMedicine, PharmacyPrice, Platform, PlatformId } from '@/lib/data'
import { supabase } from '@/lib/supabase'

interface CartContextType {
  items: Record<string, number>
  totalItems: number
  isOpen: boolean
  setOpen: (open: boolean) => void
  add: (id: string) => void
  increment: (id: string) => void
  decrement: (id: string) => void
  removeItem: (id: string) => void
  recordMedicineSearch: (id: string) => void
  medicines: CatalogMedicine[]
  registerMedicines: (medicines: CatalogMedicine[]) => void
  resolveLivePrices: (medicine: CatalogMedicine) => Promise<void>
  resolveLivePricesBatch: (medicines: CatalogMedicine[]) => Promise<void>
  platforms: Platform[]
  isLive: boolean
  loadingPriceIds: ReadonlySet<string>
}

const CartContext = createContext<CartContextType | undefined>(undefined)

function platformIdFromName(platformName: string): PlatformId | null {
  const name = platformName.trim().toLowerCase()
  if (name.includes('1mg')) return 'tata1mg'
  if (name.includes('pharmeasy')) return 'pharmeasy'
  if (name.includes('netmeds')) return 'netmeds'
  if (name.includes('apollo')) return 'apollo'
  if (name.includes('truemeds')) return 'truemeds'
  if (name.includes('medplus')) return 'medplus'
  return null
}

function isPharmacyPriceArray(value: unknown): value is PharmacyPrice[] {
  return Array.isArray(value) && value.every((price: unknown) => (
    typeof price === 'object'
    && price !== null
    && 'medicine_id' in price
    && typeof price.medicine_id === 'string'
    && 'platform_name' in price
    && typeof price.platform_name === 'string'
    && 'price' in price
    && typeof price.price === 'number'
    && 'updated_at' in price
    && typeof price.updated_at === 'string'
  ))
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRICE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function needsPriceRefresh(medicine: CatalogMedicine, now = Date.now()) {
  return PLATFORMS.some(({ id }) => {
    if (!medicine.livePricePlatforms?.includes(id)) return true
    const cachedPrice = medicine.pharmacyPrices?.find(
      (price) => platformIdFromName(price.platform_name) === id,
    )
    if (!cachedPrice) return true
    const updatedAt = Date.parse(cachedPrice.updated_at)
    return !Number.isFinite(updatedAt) || updatedAt < now - PRICE_CACHE_TTL_MS || updatedAt > now
  })
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({})
  const [isOpen, setOpen] = useState(false)
  const [medicines, setMedicines] = useState<CatalogMedicine[]>(MEDICINES)
  const [platforms, setPlatforms] = useState<Platform[]>(PLATFORMS)
  const [isLive, setIsLive] = useState(false)
  const [loadingPriceIds, setLoadingPriceIds] = useState<ReadonlySet<string>>(new Set())
  const priceRequests = useRef(new Map<string, Promise<void>>())

  const registerMedicines = useCallback((newMedicines: CatalogMedicine[]) => {
    setMedicines((current) => {
      const currentById = new Map(current.map((medicine) => [medicine.id, medicine]))
      for (const medicine of newMedicines) {
        const existing = currentById.get(medicine.id)
        currentById.set(medicine.id, existing ? {
          ...medicine,
          prices: existing.prices,
          livePricePlatforms: existing.livePricePlatforms,
          pharmacyPrices: existing.pharmacyPrices,
        } : medicine)
      }
      return [...currentById.values()]
    })
  }, [])

  const resolveLivePrices = useCallback((medicine: CatalogMedicine): Promise<void> => {
    if (!UUID_PATTERN.test(medicine.id)) return Promise.resolve()

    if (!needsPriceRefresh(medicine)) return Promise.resolve()

    const existingRequest = priceRequests.current.get(medicine.id)
    if (existingRequest) return existingRequest

    setLoadingPriceIds((current) => new Set(current).add(medicine.id))

    const request = (async () => {
      try {
        const params = new URLSearchParams({ medicine_id: medicine.id, mrp: String(medicine.mrp) })
        const response = await fetch(`/api/live-prices?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`Live price request failed with status ${response.status}`)
        }

        const responseData: unknown = await response.json()
        if (!isPharmacyPriceArray(responseData)) {
          throw new Error('Live price API returned an invalid response.')
        }

        const pricesByPlatform = new Map<PlatformId, number>()
        const validPrices: PharmacyPrice[] = []
        for (const price of responseData) {
          if (price.medicine_id !== medicine.id || !Number.isFinite(price.price) || price.price <= 0) continue
          const platformId = platformIdFromName(price.platform_name)
          if (platformId) {
            pricesByPlatform.set(platformId, price.price)
            validPrices.push(price)
          }
        }

        if (PLATFORMS.some(({ id }) => !pricesByPlatform.has(id))) {
          throw new Error('Live price API did not return prices for every pharmacy.')
        }

        setMedicines((current) => current.map((entry) => {
          if (entry.id !== medicine.id) return entry

          const pharmacyPricesByPlatform = new Map<PlatformId, PharmacyPrice>()
          for (const price of entry.pharmacyPrices ?? []) {
            const platformId = platformIdFromName(price.platform_name)
            if (platformId) pharmacyPricesByPlatform.set(platformId, price)
          }
          for (const price of validPrices) {
            const platformId = platformIdFromName(price.platform_name)
            if (platformId) pharmacyPricesByPlatform.set(platformId, price)
          }

          return {
            ...entry,
            prices: { ...entry.prices, ...Object.fromEntries(pricesByPlatform) },
            livePricePlatforms: [...pricesByPlatform.keys()],
            pharmacyPrices: [...pharmacyPricesByPlatform.values()],
          }
        }))
      } catch (error) {
        console.error(`Unable to load live prices for medicine ${medicine.id}:`, error)
        throw error
      } finally {
        priceRequests.current.delete(medicine.id)
        setLoadingPriceIds((current) => {
          const next = new Set(current)
          next.delete(medicine.id)
          return next
        })
      }
    })()

    priceRequests.current.set(medicine.id, request)
    return request
  }, [])

  const resolveLivePricesBatch = useCallback(async (requestedMedicines: CatalogMedicine[]): Promise<void> => {
    const medicinesToResolve = [...new Map(
      requestedMedicines
        .filter((medicine) => (
          UUID_PATTERN.test(medicine.id)
          && needsPriceRefresh(medicine)
        ))
        .map((medicine) => [medicine.id, medicine]),
    ).values()]
    if (medicinesToResolve.length === 0) return

    for (const medicine of medicinesToResolve) {
      const pendingRequest = priceRequests.current.get(medicine.id)
      if (pendingRequest) await pendingRequest
    }

    const medicineIds = medicinesToResolve.map(({ id }) => id)
    setLoadingPriceIds((current) => new Set([...current, ...medicineIds]))

    try {
      const response = await fetch('/api/live-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicines: medicinesToResolve.map(({ id, mrp }) => ({ medicine_id: id, mrp })),
        }),
      })
      if (!response.ok) {
        throw new Error(`Batch live price request failed with status ${response.status}`)
      }

      const responseData: unknown = await response.json()
      if (!isPharmacyPriceArray(responseData)) {
        throw new Error('Batch live price API returned an invalid response.')
      }

      const pricesByMedicine = new Map<string, PharmacyPrice[]>()
      for (const price of responseData) {
        if (
          !medicineIds.includes(price.medicine_id)
          || !Number.isFinite(price.price)
          || price.price <= 0
          || !platformIdFromName(price.platform_name)
        ) continue
        const prices = pricesByMedicine.get(price.medicine_id) ?? []
        prices.push(price)
        pricesByMedicine.set(price.medicine_id, prices)
      }

      for (const id of medicineIds) {
        const platformIds = new Set((pricesByMedicine.get(id) ?? []).map(
          ({ platform_name }) => platformIdFromName(platform_name),
        ))
        if (PLATFORMS.some(({ id: platformId }) => !platformIds.has(platformId))) {
          throw new Error(`Batch live price API did not return every pharmacy for medicine ${id}.`)
        }
      }

      setMedicines((current) => current.map((medicine) => {
        const livePrices = pricesByMedicine.get(medicine.id)
        if (!livePrices) return medicine

        const prices = { ...medicine.prices }
        const livePricePlatforms = new Set(medicine.livePricePlatforms ?? [])
        const pharmacyPricesByPlatform = new Map<PlatformId, PharmacyPrice>()
        for (const price of medicine.pharmacyPrices ?? []) {
          const platformId = platformIdFromName(price.platform_name)
          if (platformId) pharmacyPricesByPlatform.set(platformId, price)
        }
        for (const price of livePrices) {
          const platformId = platformIdFromName(price.platform_name)
          if (!platformId) continue
          prices[platformId] = price.price
          livePricePlatforms.add(platformId)
          pharmacyPricesByPlatform.set(platformId, price)
        }

        return {
          ...medicine,
          prices,
          livePricePlatforms: [...livePricePlatforms],
          pharmacyPrices: [...pharmacyPricesByPlatform.values()],
        }
      }))
    } catch (error) {
      console.error('Unable to load live prices for selected medicines:', error)
      throw error
    } finally {
      setLoadingPriceIds((current) => {
        const next = new Set(current)
        for (const id of medicineIds) next.delete(id)
        return next
      })
    }
  }, [])

  const recordMedicineSearch = useCallback((id: string) => {
    if (!UUID_PATTERN.test(id)) return
    void (async () => {
      try {
        await supabase.rpc('increment_search_count', { medicine_id: id })
      } catch {
        // Search telemetry is best-effort and must not interrupt checkout or browsing.
      }
    })()
  }, [])

  useEffect(() => {
    async function fetchMemberships() {
      const { data, error } = await supabase.from('platform_memberships').select('*')
      if (error) {
        console.error('Unable to load platform memberships:', error)
        return
      }

      const updatedPlatforms = PLATFORMS.map((platform) => {
        const match = data.find((entry) => (
          entry.platform_name.toLowerCase() === platform.name.toLowerCase()
          || (entry.platform_name === 'Tata 1mg' && platform.id === 'tata1mg')
        ))
        if (!match) return platform

        return {
          ...platform,
          membership: {
            ...platform.membership,
            fee: Number(match.fee),
            durationMonths: Number(match.duration_months),
            benefitPct: Number(match.benefit_pct),
            freeDelivery: match.free_delivery,
          },
        }
      })
      setPlatforms(updatedPlatforms)
      setIsLive(true)
    }

    void fetchMemberships()
  }, [])

  const totalItems = useMemo(
    () => Object.values(items).reduce((total, quantity) => total + (quantity || 0), 0),
    [items],
  )

  const add = useCallback((id: string) => {
    const medicine = medicines.find((entry) => entry.id === id)
    recordMedicineSearch(id)
    if (medicine) void resolveLivePrices(medicine).catch(() => undefined)
    setItems((current) => ({ ...current, [id]: (current[id] || 0) + 1 }))
  }, [medicines, recordMedicineSearch, resolveLivePrices])

  const increment = useCallback((id: string) => {
    const medicine = medicines.find((entry) => entry.id === id)
    if (medicine) void resolveLivePrices(medicine).catch(() => undefined)
    setItems((current) => ({ ...current, [id]: (current[id] || 0) + 1 }))
  }, [medicines, resolveLivePrices])

  const decrement = (id: string) => setItems((current) => {
    const next = { ...current }
    if (next[id] > 1) next[id] -= 1
    else delete next[id]
    return next
  })

  const removeItem = (id: string) => setItems((current) => {
    const next = { ...current }
    delete next[id]
    return next
  })

  return (
    <CartContext.Provider value={{
      items,
      totalItems,
      isOpen,
      setOpen,
      add,
      increment,
      decrement,
      removeItem,
      recordMedicineSearch,
      medicines,
      registerMedicines,
      resolveLivePrices,
      resolveLivePricesBatch,
      platforms,
      isLive,
      loadingPriceIds,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within a CartProvider')
  return context
}
