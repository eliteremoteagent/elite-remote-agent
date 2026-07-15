// Supabase Edge Function: stripe-webhook
// Fires on Stripe checkout.session.completed → creates client account + sends emails
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno&deno-std=0.177.0'
import { SmtpClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// ── EMAIL ──────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = new SmtpClient()
  try {
    await client.connectTLS({
      hostname: 'smtp.gmail.com',
      port: 465,
      username: Deno.env.get('GMAIL_USER')!,
      password: Deno.env.get('GMAIL_APP_PASSWORD')!,
    })
    await client.send({
      from: `Elite Remote Agent <${Deno.env.get('GMAIL_USER')}>`,
      to,
      subject,
      html,
    })
    await client.close()
    console.log('Email sent to:', to)
  } catch (err) {
    console.error('Email send error:', err)
  }
}

function welcomeEmail(email: string, plan: string): string {
  const planNames: Record<string, string> = {
    starter: 'Starter', starter_monthly: 'Starter', starter_setup: 'Starter',
    growth: 'Growth', elite: 'Elite Team',
  }
  const planName = planNames[plan] ?? 'Starter'
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#050810;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:26px;font-weight:900;letter-spacing:3px;color:#D4A843;">ELITE REMOTE AGENT</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:4px;margin-top:4px;">CLIENT PORTAL</div>
  </div>
  <div style="background:#0F1525;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;margin-bottom:24px;">
    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:12px;">Welcome to Elite Remote Agent! 🎉</div>
    <div style="font-size:15px;color:rgba(255,255,255,0.6);line-height:1.8;margin-bottom:28px;">
      Your <strong style="color:#D4A843;">${planName} Plan</strong> is now active. You have full access to browse our pre-screened VA roster, manage your team, and scale your business — starting right now.
    </div>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://eliteremoteagent.com/dashboard.html" style="display:inline-block;background:#D4A843;color:#050810;text-decoration:none;font-weight:800;font-size:15px;padding:14px 40px;border-radius:10px;">Access Your Dashboard →</a>
    </div>
    <div style="background:rgba(212,168,67,0.08);border:1px solid rgba(212,168,67,0.15);border-radius:10px;padding:20px;">
      <div style="font-size:11px;font-weight:700;color:#D4A843;letter-spacing:1.5px;margin-bottom:14px;">YOUR NEXT STEPS</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:2.2;">
        ✓ Log in at eliteremoteagent.com/dashboard.html using <strong style="color:#fff;">${email}</strong><br/>
        ✓ Check your email for a separate link to set your password<br/>
        ✓ Browse our pre-screened VA profiles and listen to voice intros<br/>
        ✓ Fill out the Done-For-You intake form for a matched placement<br/>
        ✓ Request an interview or hire a VA directly from the portal
      </div>
    </div>
  </div>
  <div style="text-align:center;font-size:13px;color:rgba(255,255,255,0.25);line-height:1.8;">
    Questions? Reply to this email anytime.<br/>
    <a href="mailto:admin@divinegrowth-va.com" style="color:#D4A843;">admin@divinegrowth-va.com</a><br/>
    <span style="font-size:11px;margin-top:8px;display:block;">© 2026 Elite Remote Agent · Divine Growth, LLC</span>
  </div>
</div>
</body>
</html>`
}

function adminAlertEmail(clientEmail: string, plan: string, amountTotal: number | null): string {
  const amount = amountTotal ? `$${(amountTotal / 100).toFixed(2)}` : 'N/A'
  const planDisplay = plan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <div style="background:#D4A843;padding:24px 32px;">
    <div style="font-size:20px;font-weight:800;color:#050810;">🎉 New Client Signed Up</div>
  </div>
  <div style="padding:32px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:12px 0;color:#888;font-size:13px;width:120px;">Email</td>
        <td style="padding:12px 0;font-weight:700;font-size:14px;">${clientEmail}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:12px 0;color:#888;font-size:13px;">Plan</td>
        <td style="padding:12px 0;font-weight:700;font-size:14px;">${planDisplay}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#888;font-size:13px;">Revenue</td>
        <td style="padding:12px 0;font-weight:700;font-size:14px;color:#2ECC71;">${amount}</td>
      </tr>
    </table>
    <div style="margin-top:24px;">
      <a href="https://eliteremoteagent.com/admin.html" style="display:inline-block;background:#D4A843;color:#050810;text-decoration:none;font-weight:800;font-size:14px;padding:12px 28px;border-radius:8px;">Open Admin Panel →</a>
    </div>
  </div>
</div>
</body>
</html>`
}

// ── HANDLER ────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
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

  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const email = session.customer_details?.email ?? session.customer_email ?? ''

  if (!email) {
    console.error('No email in session:', session.id)
    return new Response('No email in session', { status: 200 })
  }

  const plan = session.mode === 'subscription' ? 'starter_monthly' : 'starter_setup'
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null

  try {
    let userId: string | undefined

    const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://eliteremoteagent.com/dashboard.html',
      data: { plan, stripe_customer_id: stripeCustomerId },
    })

    if (inviteErr) {
      if (inviteErr.message.toLowerCase().includes('already')) {
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

    await Promise.all([
      sendEmail(email, 'Welcome to Elite Remote Agent — Your Account is Ready!', welcomeEmail(email, plan)),
      sendEmail(
        Deno.env.get('GMAIL_USER')!,
        `🎉 New Client Signed Up — ${plan.replace(/_/g, ' ')}`,
        adminAlertEmail(email, plan, session.amount_total)
      ),
    ])

  } catch (err) {
    console.error('Provisioning error:', err)
    return new Response('Error: ' + err.message, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
