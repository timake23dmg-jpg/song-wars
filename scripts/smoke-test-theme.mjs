// Verifies the games.theme column exists and round-trips correctly against
// the live Supabase project.
//
// Run with:  node --env-file=.env.local scripts/smoke-test-theme.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run with --env-file=.env.local')
  process.exit(1)
}
function must(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) process.exitCode = 1
}

async function main() {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: session } = await c.auth.signInAnonymously()
  const code = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase()

  const { error: insErr } = await c.from('games').insert({ code, mode: 'theme_night', theme: 'era_1990s' })
  must('insert a game with a theme succeeds', !insErr)
  if (insErr) console.log(insErr)

  // The games UPDATE policy requires being a member of the room (see
  // schema.sql) — a session with no players row can't update it, so join
  // as the host before testing the theme-change path below.
  await c.from('players').insert({ id: crypto.randomUUID(), game_code: code, slot: 0, name: 'Host', user_id: session.user.id })

  const { data, error: readErr } = await c.from('games').select('theme, mode').eq('code', code).maybeSingle()
  must('theme round-trips correctly', !readErr && data?.theme === 'era_1990s' && data?.mode === 'theme_night')

  const { error: updateErr } = await c.from('games').update({ theme: 'pop_kpop' }).eq('code', code)
  const { data: updated } = await c.from('games').select('theme').eq('code', code).maybeSingle()
  must('theme can be changed (host re-picking in the lobby)', !updateErr && updated?.theme === 'pop_kpop')

  console.log(`\nDone. Test room code "${code}" left in the database.`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exitCode = 1
})
