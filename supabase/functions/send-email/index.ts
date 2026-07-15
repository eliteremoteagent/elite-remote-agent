// Supabase Edge Function: send-email
// Called from admin.html to notify clients and VAs of assignments
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { SmtpClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    console.error('Email error:', err)
    throw err
  }
}

function vaAssignedClientEmail(data: {
  client_name: string
  va_name: string
  va_role: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#050810;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:26px;font-weight:900;letter-spacing:3px;color:#D4A843;">ELITE REMOTE AGENT</div>
  </div>
  <div style="background:#0F1525;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;margin-bottom:24px;">
    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:12px;">Your VA Has Been Matched! 🎯</div>
    <div style="font-size:15px;color:rgba(255,255,255,0.6);line-height:1.8;margin-bottom:28px;">
      Hi ${data.client_name}! We've assigned <strong style="color:#D4A843;">${data.va_name}</strong> as your ${data.va_role}. Log into your dashboard to connect.
    </div>
    <div style="background:rgba(212,168,67,0.08);border:1px solid rgba(212,168,67,0.15);border-radius:10px;padding:20px;margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;color:#D4A843;letter-spacing:1.5px;margin-bottom:12px;">YOUR ASSIGNED VA</div>
      <div style="font-size:16px;font-weight:800;color:#fff;">${data.va_name}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.45);margin-top:4px;">${data.va_role}</div>
    </div>
    <div style="text-align:center;">
      <a href="https://eliteremoteagent.com/dashboard.html" style="display:inline-block;background:#D4A843;color:#050810;text-decoration:none;font-weight:800;font-size:15px;padding:14px 40px;border-radius:10px;">View Your Dashboard →</a>
    </div>
  </div>
  <div style="text-align:center;font-size:13px;color:rgba(255,255,255,0.25);line-height:1.8;">
    <a href="mailto:admin@divinegrowth-va.com" style="color:#D4A843;">admin@divinegrowth-va.com</a><br/>
    <span style="font-size:11px;">© 2026 Elite Remote Agent · Divine Growth, LLC</span>
  </div>
</div>
</body>
</html>`
}

function vaAssignedAdminEmail(data: {
  client_email: string
  client_name: string
  va_name: string
  va_role: string
}): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:#2ECC71;padding:20px 28px;">
    <div style="font-size:18px;font-weight:800;color:#fff;">✅ VA Assignment Confirmed</div>
  </div>
  <div style="padding:28px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#888;font-size:13px;width:100px;">Client</td>
        <td style="padding:10px 0;font-weight:700;font-size:14px;">${data.client_name} (${data.client_email})</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 0;color:#888;font-size:13px;">VA Assigned</td>
        <td style="padding:10px 0;font-weight:700;font-size:14px;">${data.va_name}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#888;font-size:13px;">Role</td>
        <td style="padding:10px 0;font-size:14px;">${data.va_role}</td>
      </tr>
    </table>
    <div style="margin-top:20px;">
      <a href="https://eliteremoteagent.com/admin.html" style="background:#D4A843;color:#050810;text-decoration:none;font-weight:800;font-size:14px;padding:10px 24px;border-radius:8px;display:inline-block;">Open Admin Panel</a>
    </div>
  </div>
</div>
</body>
</html>`
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { type, to, data } = await req.json()

    if (type === 'va_assigned') {
      await sendEmail(
        to,
        `Your VA Has Been Assigned — ${data.va_name} is Ready to Start!`,
        vaAssignedClientEmail(data)
      )
      await sendEmail(
        Deno.env.get('GMAIL_USER')!,
        `VA Assignment Confirmed — ${data.client_name}`,
        vaAssignedAdminEmail({ ...data, client_email: to })
      )
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
