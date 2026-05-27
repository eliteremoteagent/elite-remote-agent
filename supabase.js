// ═══════════════════════════════════════════════════════════════════
// SUPABASE CLIENT — Elite Remote Agent
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://wcmvtfclkybgdwjybyzb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbXZ0ZmNsa3liZ2R3anlieXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMzExOTIsImV4cCI6MjA5NDgwNzE5Mn0.zI0tjF7dN0DT30Mkd1nEDyMdXlYPzTmKH3BxvNea1Fs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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
