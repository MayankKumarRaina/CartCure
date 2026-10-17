"use client"

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react"
import { createClient } from "@supabase/supabase-js"
import { Medicine, PLATFORMS, Platform, MEDICINES } from "@/lib/data"

// Initialize Supabase with your public Anon Key
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
  platforms: Platform[] // NEW: Expose live platforms globally
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({})
  const [isOpen, setOpen] = useState(false)
  const [medicines, setMedicines] = useState<Medicine[]>(MEDICINES)
  const [platforms, setPlatforms] = useState<Platform[]>(PLATFORMS)

  // Fetch live membership pricing on app load
  useEffect(() => {
    async function fetchLiveMemberships() {
      const { data, error } = await supabase.from('platform_memberships').select('*')
      
      if (data && !error) {
        const updatedPlatforms = PLATFORMS.map(p => {
          const liveData = data.find(d => d.platform_name === p.name)
          if (liveData) {
            return {
              ...p,
              membership: {
                ...p.membership,
                fee: Number(liveData.fee),
                durationMonths: Number(liveData.duration_months),
                benefitPct: Number(liveData.benefit_pct),
                freeDelivery: liveData.free_delivery
              }
            }
          }
          return p
        })
        setPlatforms(updatedPlatforms)
      }
    }
    fetchLiveMemberships()
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
    <CartContext.Provider value={{ items, totalItems, isOpen, setOpen, add, increment, decrement, removeItem, medicines, platforms }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error("useCart must be used within a CartProvider")
  return context
}