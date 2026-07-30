// Supabase Edge Function: stripe-webhook
// Fires on Stripe checkout.session.completed → creates client account + sends invite,
// and (for the Starter one-time setup fee) auto-starts the $49/mo subscription 30 days later.
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

// Known Stripe Price IDs (Product catalog, Jul 2026)
const PRICE_IDS: Record<string, string> = {
  price_1TsoPsJnVm6LpZiRtv8gONb7: 'starter_setup',      // $149 one-time
  price_1TsoRFJnVm6LpZiRpgkIwDDZ: 'starter_monthly',    // $49/mo
  price_1TXR2cJnVm6LpZiRLwyKtB3b: 'growth_monthly',     // $247/mo
  price_1TXR3HJnVm6LpZiRIiz7SzrU: 'growth_annual',      // $2,470/yr (one-time prepay)
  price_1TXR4PJnVm6LpZiRQGG8whe9: 'elite_monthly',      // $597/mo
  price_1TXR4cJnVm6LpZiRpb2G206Z: 'elite_annual',       // $5,970/yr (one-time prepay)
}

const STARTER_SETUP_PRICE_ID = 'price_1TsoPsJnVm6LpZiRtv8gONb7'
const STARTER_MONTHLY_PRICE_ID = 'price_1TsoRFJnVm6LpZiRpgkIwDDZ'
const STARTER_TRIAL_DAYS = 30 // recurring $49/mo billing starts 30 days after the $149 setup fee

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

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null

  // Figure out which price/plan this session was for
  let priceId: string | undefined
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
    priceId = lineItems.data[0]?.price?.id
  } catch (err) {
    console.error('Could not list line items for session', session.id, err)
  }
  const plan = (priceId && PRICE_IDS[priceId]) || (session.mode === 'subscription' ? 'unknown_subscription' : 'unknown_one_time')

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

  // ── Starter Setup fee → auto-start the $49/mo subscription, 30 days out ──
  // No re-entry of card details: the Payment Link has "Save payment details for
  // future use" enabled, so Stripe already attached a reusable payment method to
  // this customer during the $149 checkout. We use that same payment method here.
  if (priceId === STARTER_SETUP_PRICE_ID && stripeCustomerId) {
    try {
      // Check we haven't already created this subscription for this customer (idempotency)
      const existing = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        price: STARTER_MONTHLY_PRICE_ID,
        status: 'all',
        limit: 1,
      })

      if (existing.data.length > 0) {
        console.log('Starter Monthly subscription already exists for', stripeCustomerId)
      } else {
        // Find the payment method used for the setup fee so we can reuse it
        let defaultPaymentMethod: string | undefined
        if (session.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string)
          defaultPaymentMethod = typeof pi.payment_method === 'string'
            ? pi.payment_method
            : pi.payment_method?.id
        }

        if (defaultPaymentMethod) {
          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: { default_payment_method: defaultPaymentMethod },
          })
        }

        const subscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: STARTER_MONTHLY_PRICE_ID }],
          trial_period_days: STARTER_TRIAL_DAYS,
          default_payment_method: defaultPaymentMethod,
          metadata: {
            source: 'starter_setup_auto_subscribe',
            setup_session_id: session.id,
          },
        })

        console.log(
          `Starter Monthly subscription ${subscription.id} created for ${email} ` +
          `(customer ${stripeCustomerId}) — first $49 charge in ${STARTER_TRIAL_DAYS} days`
        )
      }
    } catch (subErr) {
      // Don't fail the whole webhook over this — the account is already provisioned.
      // Log loudly so it surfaces for manual follow-up (customer paid $149 but has no
      // recurring subscription scheduled).
      console.error(
        `FAILED to auto-create Starter Monthly subscription for ${email} ` +
        `(customer ${stripeCustomerId}), session ${session.id}:`, subErr
      )
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
