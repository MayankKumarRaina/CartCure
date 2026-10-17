"use client"

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react"
import { createClient } from "@supabase/supabase-js"
import { Medicine, PLATFORMS, Platform, MEDICINES, PlatformId } from "@/lib/data"

// Initialize Supabase
const supabaseUrl = "https://sofowqilxmplbfownnqh.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZm93cWlseG1wbGJmb3dubnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzA1MDcsImV4cCI6MjEwNzgwNjUwN30.18rDg6X-3eJx1N9jHgbPCdZhYt5m23OiaL9DBQ73qE4"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface CartContextType {
  items: Record<string, number>
  totalItems: number
  isOpen: boolean
  setOpen: (open: boolean) => void
  add: (id: string) => void
  increment: (id: string) => void
  decrement: (id: string) => void
  removeItem: (id: string) => void
  medicines: Medicine[]
  platforms: Platform[]
  isLive: boolean
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({})
  const [isOpen, setOpen] = useState(false)
  const [medicines, setMedicines] = useState<Medicine[]>(MEDICINES)
  const [platforms, setPlatforms] = useState<Platform[]>(PLATFORMS)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    async function fetchLiveDB() {
      try {
        // 1. Fetch Live Memberships
        const { data: memData } = await supabase.from('platform_memberships').select('*')
        if (memData) {
          const updatedPlatforms = PLATFORMS.map(p => {
            const dbMatch = memData.find(d => 
              d.platform_name.toLowerCase() === p.name.toLowerCase() || 
              (d.platform_name === 'Tata 1mg' && p.id === 'tata1mg')
            )
            if (dbMatch) {
              return {
                ...p,
                membership: {
                  ...p.membership,
                  fee: Number(dbMatch.fee),
                  durationMonths: Number(dbMatch.duration_months),
                  benefitPct: Number(dbMatch.benefit_pct),
                  freeDelivery: dbMatch.free_delivery
                }
              }
            }
            return p
          })
          setPlatforms(updatedPlatforms)
        }

        // 2. Fetch Live Medicines and Prices
        const { data: medsData } = await supabase.from('medicines').select('*')
        const { data: pricesData } = await supabase.from('pharmacy_prices').select('*')

        if (medsData && medsData.length > 0 && pricesData) {
          const liveMedicines: Medicine[] = medsData.map(med => {
            const medPrices = pricesData.filter(p => p.medicine_id === med.id)
            const pricesRecord: Partial<Record<PlatformId, number>> = {}
            
            // Map Supabase platform names to local PlatformIds
            medPrices.forEach(p => {
              let pid: PlatformId | null = null
              const pName = p.platform_name?.toLowerCase() || ''
              if(pName.includes('1mg')) pid = 'tata1mg'
              else if(pName.includes('pharmeasy')) pid = 'pharmeasy'
              else if(pName.includes('netmeds')) pid = 'netmeds'
              else if(pName.includes('apollo')) pid = 'apollo'
              else if(pName.includes('truemeds')) pid = 'truemeds'
              else if(pName.includes('medplus')) pid = 'medplus'

              if (pid) pricesRecord[pid] = p.selling_price
            })

            return {
              id: med.id,
              name: med.brand_name || med.name || 'Unknown',
              mrp: med.mrp || 0,
              pack: med.pack_size || med.pack || '',
              salt: med.salt_composition || med.salt || '',
              manufacturer: med.manufacturer || '',
              categories: med.categories || ['Vitamins & Supplements'],
              rxRequired: med.rx_required || false,
              // Fallback to MRP if a platform price is missing during a scrape
              prices: {
                tata1mg: pricesRecord['tata1mg'] ?? med.mrp,
                pharmeasy: pricesRecord['pharmeasy'] ?? med.mrp,
                netmeds: pricesRecord['netmeds'] ?? med.mrp,
                apollo: pricesRecord['apollo'] ?? med.mrp,
                truemeds: pricesRecord['truemeds'] ?? med.mrp,
                medplus: pricesRecord['medplus'] ?? med.mrp,
              }
            }
          })
          
          setMedicines(liveMedicines)
          setIsLive(true)
        }
      } catch (error) {
        console.error("Error fetching Live DB:", error)
      }
    }
    
    fetchLiveDB()
  }, [])

  const totalItems = useMemo(() => Object.values(items).reduce((acc, curr) => acc + (curr || 0), 0), [items])

  const add = (id: string) => setItems(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
  const increment = (id: string) => setItems(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
  const decrement = (id: string) => setItems(prev => {
    const next = { ...prev }
    if (next[id] > 1) next[id] -= 1
    else delete next[id]
    return next
  })
  const removeItem = (id: string) => setItems(prev => {
    const next = { ...prev }
    delete next[id]
    return next
  })

  return (
    <CartContext.Provider value={{ items, totalItems, isOpen, setOpen, add, increment, decrement, removeItem, medicines, platforms, isLive }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error("useCart must be used within a CartProvider")
  return context
}