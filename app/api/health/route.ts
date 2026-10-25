import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const { error } = await supabase.from('medicines').select('id').limit(1)
    if (error) throw error
    return NextResponse.json({
      ok: true,
      db: 'warm',
      timestamp: new Date().toISOString(),
    }, { headers })
  } catch (error) {
    console.error('Supabase keep-alive check failed:', error)
    return NextResponse.json({
      ok: false,
      db: 'unavailable',
      timestamp: new Date().toISOString(),
    }, { status: 503, headers })
  }
}
