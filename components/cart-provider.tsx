'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { MEDICINES, type Medicine } from '@/lib/data'
import { loadMedicines } from '@/lib/medicines'

const MAX_QTY = 20

type CartContextValue = {
  items: Record<string, number>
  totalItems: number
  isOpen: boolean
  setOpen: (open: boolean) => void
  add: (id: string) => void
  increment: (id: string) => void
  decrement: (id: string) => void
  remove: (id: string) => void
  medicines: Medicine[]
  dataSource: 'live' | 'demo'
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({})
  const [isOpen, setOpen] = useState(false)
  const [medicines, setMedicines] = useState(MEDICINES)
  const [dataSource, setDataSource] = useState<'live' | 'demo'>('demo')
  useEffect(() => {
    let active = true
    loadMedicines().then((result) => {
      if (active) { setMedicines(result.medicines); setDataSource(result.source) }
    })
    return () => { active = false }
  }, [])

  const setQty = useCallback((id: string, update: (qty: number) => number) => {
    setItems((prev) => {
      const next = Math.max(0, Math.min(MAX_QTY, update(prev[id] ?? 0)))
      const copy = { ...prev }
      if (next === 0) delete copy[id]
      else copy[id] = next
      return copy
    })
  }, [])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalItems: Object.values(items).reduce((a, b) => a + b, 0),
      isOpen,
      setOpen,
      add: (id) => setQty(id, (q) => q + 1),
      increment: (id) => setQty(id, (q) => q + 1),
      decrement: (id) => setQty(id, (q) => q - 1),
      remove: (id) => setQty(id, () => 0),
      medicines,
      dataSource,
    }),
    [items, isOpen, setQty, medicines, dataSource],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
