import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Batch price refresh is handled by the scheduled GitHub Actions worker.' },
    { status: 410 },
  )
}
