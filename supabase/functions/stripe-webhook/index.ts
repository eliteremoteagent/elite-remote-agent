// Supabase Edge Function: stripe-webhook
// Fires on Stripe checkout.session.completed → creates client account + sends invite
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno&deno-std=0.177.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req: Request) => {
  // Verify Stripe signature
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
    )
  } catch (err) {
    console.error('Signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log('Event received:', event.type)

  // Only process completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const email = session.customer_details?.email ?? session.customer_email ?? ''

  if (!email) {
    console.error('No email in session:', session.id)
    return new Response('No email in session', { status: 200 })
  }

  // Derive plan from session mode
  const plan = session.mode === 'subscription' ? 'starter_monthly' : 'starter_setup'
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null

  try {
    let userId: string | undefined

    // Invite user: creates account + sends email with dashboard link
    const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://eliteremoteagent.com/dashboard.html',
      data: { plan, stripe_customer_id: stripeCustomerId },
    })

    if (inviteErr) {
      if (inviteErr.message.toLowerCase().includes('already')) {
        // User already has an account — find their ID
        const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
        userId = users?.find(u => u.email === email)?.id
        console.log('Existing user found:', email, userId)
      } else {
        throw inviteErr
      }
    } else {
      userId = invite?.user?.id
      console.log('Invited new user:', email, userId)
    }

    // Upsert client record
    const { error: dbErr } = await supabase.from('clients').upsert({
      user_id: userId,
      email,
      stripe_customer_id: stripeCustomerId,
      stripe_session_id: session.id,
      plan,
      status: 'active',
    }, { onConflict: 'email' })

    if (dbErr) throw dbErr

    console.log(`Client provisioned: ${email} (${plan})`)
  } catch (err) {
    console.error('Provisioning error:', err)
    return new Response('Error: ' + err.message, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
