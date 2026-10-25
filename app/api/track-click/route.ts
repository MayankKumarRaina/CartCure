import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

type ClickPayload = {
  platformId: string
  isAffiliate: boolean
  medicineId?: string | number
  medicineName?: string
  clickedPrice?: number | null
  sourceComponent: string
  basketSize?: number
}

function isClickPayload(value: unknown): value is ClickPayload {
  if (typeof value !== 'object' || value === null) return false
  if (!('platformId' in value) || !('isAffiliate' in value) || !('sourceComponent' in value)) return false
  if (typeof value.platformId !== 'string' || !value.platformId.trim() || value.platformId.length > 80) return false
  if (typeof value.isAffiliate !== 'boolean' || typeof value.sourceComponent !== 'string') return false
  if ('medicineId' in value && value.medicineId !== undefined
    && typeof value.medicineId !== 'string'
    && (typeof value.medicineId !== 'number' || !Number.isFinite(value.medicineId))) return false
  if ('medicineId' in value && typeof value.medicineId === 'string' && value.medicineId.length > 100) return false
  if ('medicineName' in value && value.medicineName !== undefined
    && (typeof value.medicineName !== 'string' || value.medicineName.length > 300)) return false
  if ('clickedPrice' in value && value.clickedPrice !== undefined && value.clickedPrice !== null
    && (typeof value.clickedPrice !== 'number' || !Number.isFinite(value.clickedPrice) || value.clickedPrice < 0)) return false
  if ('basketSize' in value && value.basketSize !== undefined
    && (typeof value.basketSize !== 'number' || !Number.isInteger(value.basketSize) || value.basketSize < 0)) return false
  return [
    'card_hero',
    'card_chip',
    'card_drawer',
    'basket_checkout',
    'partner_banner',
  ].includes(value.sourceComponent)
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json()
    if (!isClickPayload(payload)) return NextResponse.json({ ok: true })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase service credentials are not configured for click tracking.')
    }
    const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey)
    const { error } = await supabaseAdmin.from('affiliate_clicks').insert({
      platform_id: payload.platformId.trim().toLowerCase(),
      is_affiliate: payload.isAffiliate,
      medicine_id: payload.medicineId === undefined ? null : String(payload.medicineId),
      medicine_name: payload.medicineName?.slice(0, 300) ?? null,
      clicked_price: payload.clickedPrice ?? null,
      source_component: payload.sourceComponent,
      basket_size: payload.basketSize ?? null,
      referrer: request.headers.get('referer')?.slice(0, 2048) ?? null,
      user_agent: request.headers.get('user-agent')?.slice(0, 1024) ?? null,
    })
    if (error) throw error
  } catch (error) {
    console.error('Unable to record affiliate click:', error)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
