// Pulls "recommendations" from the external Forex API and compares them
// with our own daily_forecasts. Writes external_forecasts + fills the
// external_direction / external_confidence / external_agreement columns.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPPORTED = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','NZD/USD','USD/CAD']

// Normalize an external recommendation record into our shape.
function normalize(rec: any) {
  const rawSide = String(rec.side ?? rec.direction ?? rec.action ?? '').toLowerCase()
  let direction: 'up' | 'down' | 'neutral' = 'neutral'
  if (['buy','long','up','bull','bullish'].includes(rawSide)) direction = 'up'
  else if (['sell','short','down','bear','bearish'].includes(rawSide)) direction = 'down'
  const num = (v: any) => (v == null || isNaN(Number(v)) ? null : Number(v))
  const symbolRaw = String(rec.symbol ?? rec.instrument ?? '').toUpperCase().replace('/', '')
  const symbol = symbolRaw.length === 6 ? `${symbolRaw.slice(0,3)}/${symbolRaw.slice(3)}` : symbolRaw
  return {
    symbol,
    direction,
    entry: num(rec.entry ?? rec.price),
    sl: num(rec.sl ?? rec.stop_loss ?? rec.stop),
    tp: num(rec.tp ?? rec.take_profit ?? rec.target),
    confidence: num(rec.confidence ?? rec.probability ?? rec.score),
    horizon_hours: num(rec.horizon_hours ?? rec.horizon) as number | null,
    raw: rec,
  }
}

function agreement(ours: string, theirs: string): string {
  if (!theirs) return 'NO_DATA'
  if (ours === theirs) return 'MATCH'
  if (ours === 'neutral' || theirs === 'neutral') return 'MIXED'
  return 'CONFLICT'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const apiKey = Deno.env.get('FOREX_API_KEY')
  const apiUrl = Deno.env.get('FOREX_API_URL')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (!apiKey || !apiUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'not_configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const summary: any = { fetched: 0, matched: 0, conflicts: 0, no_data: 0, errors: [] as string[] }
  const bySymbol = new Map<string, ReturnType<typeof normalize>>()

  // 1. Pull recommendations (single call — API returns list).
  try {
    const r = await fetch(`${apiUrl}?action=recommendations`, { headers: { 'x-api-key': apiKey } })
    const data = await r.json()
    const records: any[] = data.records ?? data.recommendations ?? []
    for (const rec of records) {
      const n = normalize(rec)
      if (!SUPPORTED.includes(n.symbol)) continue
      bySymbol.set(n.symbol, n)
      summary.fetched++
      await supabase.from('external_forecasts').upsert({
        symbol: n.symbol,
        forecast_date: today,
        direction: n.direction,
        entry: n.entry, sl: n.sl, tp: n.tp,
        confidence: n.confidence,
        horizon_hours: n.horizon_hours,
        source: 'forex-market-data',
        raw: n.raw,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'symbol,forecast_date,source' })
    }
  } catch (e) {
    summary.errors.push(`recommendations: ${e}`)
  }

  // 2. Compare with our forecasts for today.
  const { data: ours } = await supabase
    .from('daily_forecasts')
    .select('id, symbol, direction')
    .eq('forecast_date', today)

  for (const f of ours ?? []) {
    const ext = bySymbol.get(f.symbol)
    const agree = agreement(f.direction, ext?.direction ?? '')
    if (agree === 'MATCH') summary.matched++
    else if (agree === 'CONFLICT') summary.conflicts++
    else if (agree === 'NO_DATA') summary.no_data++
    await supabase
      .from('daily_forecasts')
      .update({
        external_direction: ext?.direction ?? null,
        external_confidence: ext?.confidence ?? null,
        external_agreement: agree,
      })
      .eq('id', f.id)
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
