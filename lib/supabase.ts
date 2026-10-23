import { createClient } from '@supabase/supabase-js'
import type { Medicine, PharmacyPrice } from './data'

type PlatformMembership = {
  id: string
  platform_name: string
  fee: number
  duration_months: number
  benefit_pct: number
  free_delivery: boolean
}

type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

type WeeklyPopularMedicine = {
  medicine_id: string
  category: string
  weekly_searches: number
}

export type Database = {
  public: {
    Tables: {
      medicines: Table<Medicine>
      pharmacy_prices: Table<PharmacyPrice>
      platform_memberships: Table<PlatformMembership>
    }
    Views: Record<string, never>
    Functions: {
      increment_search_count: {
        Args: { medicine_id: string }
        Returns: undefined
      }
      get_weekly_popular_medicines: {
        Args: Record<PropertyKey, never>
        Returns: WeeklyPopularMedicine[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sofowqilxmplbfownnqh.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '******'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
