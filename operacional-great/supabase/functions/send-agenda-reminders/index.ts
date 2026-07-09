import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgendaEvent {
  id: string;
  title: string;
  client_name: string;
  client_phone: string;
  event_date: string;
  event_time: string;
  meeting_link: string | null;
  reminder_2h_sent: boolean;
  reminder_30min_sent: boolean;
}

function normalizeEvolutionBaseUrl(raw: string): string {
  let base = raw.trim();
  // Fix common typo: https:/example.com -> https://example.com
  base = base.replace(/^https?:\/(?!\/)/i, (m) => m + '/');
  base = base.replace(/\/+$/, '');
  // Some providers expose a /manager UI; API base is the root URL
  base = base.replace(/\/manager$/i, '');
  return base;
}

async function sendWhatsAppMessage(
  phone: string,
  message: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  instanceName: string
): Promise<boolean> {
  try {
    // Format phone number for WhatsApp (Brazil format)
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }

    const endpoint = `${evolutionApiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        // Backwards/forwards compatibility across Evolution API versions
        text: message,
        textMessage: { text: message },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', {
        status: response.status,
        endpoint,
        body: errorText,
      });
      return false;
    }

    const result = await response.json().catch(() => null);
    console.log('Message sent successfully:', result ?? { ok: true });
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const evolutionApiUrlRaw = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceNameRaw =
      Deno.env.get('EVOLUTION_INSTANCE_NAME') ?? Deno.env.get('EVOLUTION_INSTANCE');

    if (!evolutionApiUrlRaw || !evolutionApiKey || !instanceNameRaw) {
      console.error('Missing Evolution API configuration');
      return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evolutionApiUrl = normalizeEvolutionBaseUrl(evolutionApiUrlRaw);
    const instanceName = instanceNameRaw.trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current time in Brazil timezone (UTC-3)
    const now = new Date();
    const brazilOffset = -3 * 60; // -3 hours in minutes
    const brazilTime = new Date(now.getTime() + (brazilOffset - now.getTimezoneOffset()) * 60000);
    
    const todayDate = brazilTime.toISOString().split('T')[0];
    const currentHour = brazilTime.getHours();
    const currentMinute = brazilTime.getMinutes();
    
    console.log(`Checking reminders at ${todayDate} ${currentHour}:${currentMinute} (Brazil time)`);

    // Fetch today's events
    const { data: events, error: fetchError } = await supabase
      .from('agenda_events')
      .select('*')
      .eq('event_date', todayDate);

    if (fetchError) {
      console.error('Error fetching events:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${events?.length || 0} events for today`);

    const results = {
      checked: events?.length || 0,
      reminders_2h_sent: 0,
      reminders_30min_sent: 0,
      errors: 0,
    };

    for (const event of events || []) {
      const [eventHour, eventMinute] = event.event_time.split(':').map(Number);
      const eventTimeInMinutes = eventHour * 60 + eventMinute;
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const minutesUntilEvent = eventTimeInMinutes - currentTimeInMinutes;

      console.log(`Event "${event.title}" at ${event.event_time}: ${minutesUntilEvent} minutes until event`);

      // Check for 2-hour reminder (between 115 and 125 minutes before)
      if (!event.reminder_2h_sent && minutesUntilEvent >= 115 && minutesUntilEvent <= 125) {
        const message = `Acabei de finalizar o conteúdo da nossa reunião, agendada para às ${event.event_time.slice(0, 5)} de hoje.\n\nNos vemos em breve! 🚀`;
        
        const sent = await sendWhatsAppMessage(
          event.client_phone,
          message,
          evolutionApiUrl,
          evolutionApiKey,
          instanceName
        );

        // Log the reminder
        await supabase
          .from('whatsapp_reminder_logs')
          .insert({
            event_id: event.id,
            client_phone: event.client_phone,
            client_name: event.client_name,
            reminder_type: '2h',
            message: message,
            status: sent ? 'sent' : 'failed',
            error_message: sent ? null : 'Failed to send via Evolution API',
          });

        if (sent) {
          await supabase
            .from('agenda_events')
            .update({ reminder_2h_sent: true })
            .eq('id', event.id);
          results.reminders_2h_sent++;
          console.log(`2h reminder sent for event: ${event.title}`);
        } else {
          results.errors++;
        }
      }

      // Check for 30-minute reminder (between 25 and 35 minutes before)
      if (!event.reminder_30min_sent && minutesUntilEvent >= 25 && minutesUntilEvent <= 35) {
        let message = `Em 30 minutos te envio o link de acesso.`;
        
        if (event.meeting_link) {
          message += `\n\n🔗 Link da reunião: ${event.meeting_link}`;
        }
        
        const sent = await sendWhatsAppMessage(
          event.client_phone,
          message,
          evolutionApiUrl,
          evolutionApiKey,
          instanceName
        );

        // Log the reminder
        await supabase
          .from('whatsapp_reminder_logs')
          .insert({
            event_id: event.id,
            client_phone: event.client_phone,
            client_name: event.client_name,
            reminder_type: '30min',
            message: message,
            status: sent ? 'sent' : 'failed',
            error_message: sent ? null : 'Failed to send via Evolution API',
          });

        if (sent) {
          await supabase
            .from('agenda_events')
            .update({ reminder_30min_sent: true })
            .eq('id', event.id);
          results.reminders_30min_sent++;
          console.log(`30min reminder sent for event: ${event.title}`);
        } else {
          results.errors++;
        }
      }
    }

    console.log('Reminder check complete:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in send-agenda-reminders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
