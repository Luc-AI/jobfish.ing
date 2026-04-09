import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text')

  if (!text || text.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const key = process.env.GEOAPIFY_API_KEY
  if (!key) return NextResponse.json({ suggestions: [] })

  try {
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete')
    url.searchParams.set('text', text)
    url.searchParams.set('type', 'city')
    url.searchParams.set('limit', '5')
    url.searchParams.set('apiKey', key)

    const res = await fetch(url.toString())
    if (!res.ok) return NextResponse.json({ suggestions: [] })

    const data = await res.json()
    const suggestions: string[] = (data.features ?? [])
      .filter(
        (f: { properties?: { city?: string; country?: string } }) =>
          f.properties?.city && f.properties?.country
      )
      .map(
        (f: { properties: { city: string; country: string } }) =>
          `${f.properties.city}, ${f.properties.country}`
      )
      .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
