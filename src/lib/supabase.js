import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.local.example to .env.local and fill them in.'
  )
}

export const supabase = createClient(url, anonKey)

// Every browser tab needs its own anonymous auth session before it can read/write
// anything — Row Level Security in supabase/schema.sql is keyed off auth.uid(),
// not the shared anon API key, so this has to happen before any table query.
let readyPromise = null
export function ensureSignedIn() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) return data.session.user
      const { data: signInData, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      return signInData.user
    })()
  }
  return readyPromise
}
