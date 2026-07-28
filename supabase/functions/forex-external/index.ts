// Proxy for the external Forex Market Data API.
// Keeps FOREX_API_KEY server-side. Frontend calls via supabase.functions.invoke.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const ALLOWED = new Set(['quote', 'candles', 'instruments', 'recommendations', 'news', 'events'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') ?? ''
    if (!ALLOWED.has(action)) {
      return json({ ok: false, error: 'action_not_allowed' }, 400)
    }

    const apiKey = Deno.env.get('FOREX_API_KEY')
    const apiUrl = Deno.env.get('FOREX_API_URL')
    if (!apiKey || !apiUrl) return json({ ok: false, error: 'not_configured' }, 500)

    const target = new URL(apiUrl)
    url.searchParams.forEach((v, k) => target.searchParams.set(k, v))

    const r = await fetch(target.toString(), { headers: { 'x-api-key': apiKey } })
    const body = await r.text()
    return new Response(body, {
      status: r.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
