// ═══════════════════════════════════════════════════════════════════
// SUPABASE CLIENT — Elite Remote Agent
// This file connects your website to your Supabase database
// Import this at the top of any HTML file that needs database access
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// These values come from your Vercel environment variables
// In plain HTML files we hardcode them here (they're public-safe)
const SUPABASE_URL = 'https://wcmvtfclkybgdwjybyzb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_2OgEXZ2Uk2dQy6Pw3VJQXg_ZzC2a1R_l'

// Create and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Quick connection test — run this to verify everything works
export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('vas')
      .select('count')
      .limit(1)
    
    if (error) throw error
    console.log('✅ Supabase connected successfully!')
    return true
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message)
    return false
  }
}
