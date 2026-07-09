import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeEvolutionBaseUrl(raw: string): string {
  let base = raw.trim();
  // Fix common typo: https:/example.com -> https://example.com
  base = base.replace(/^https?:\/(?!\/)/i, (m) => m + '/');
  base = base.replace(/\/+$/, '');
  // Some providers expose a /manager UI; API base is the root URL
  base = base.replace(/\/manager$/i, '');
  return base;
}

function isLikelyUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('http:/') ||
    v.startsWith('https:/') ||
    v.startsWith('www.')
  );
}

type EvolutionConfig = {
  evolutionApiUrl: string;
  instanceName: string;
  swapped: boolean;
};

function resolveEvolutionConfig(
  evolutionApiUrlRaw: string,
  instanceNameRaw: string
): EvolutionConfig | null {
  const urlRaw = evolutionApiUrlRaw.trim();
  const instRaw = instanceNameRaw.trim();

  const urlLooksUrl = isLikelyUrl(urlRaw);
  const instLooksUrl = isLikelyUrl(instRaw);

  // Expected: URL + slug
  if (urlLooksUrl && !instLooksUrl) {
    return {
      evolutionApiUrl: normalizeEvolutionBaseUrl(urlRaw),
      instanceName: instRaw,
      swapped: false,
    };
  }

  // Common mistake: swapped values
  if (!urlLooksUrl && instLooksUrl) {
    return {
      evolutionApiUrl: normalizeEvolutionBaseUrl(instRaw),
      instanceName: urlRaw,
      swapped: true,
    };
  }

  // If both are URLs or neither are URLs, we can't safely infer intent.
  return null;
}

async function sendWhatsAppMessage(
  phone: string,
  message: string,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  instanceName: string
): Promise<boolean> {
  try {
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
      // Parse error to provide better feedback
      let errorDetails = 'Erro ao enviar mensagem';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.response?.message?.includes('Connection Closed')) {
          errorDetails = 'WhatsApp desconectado. Reconecte a instância no painel da Evolution API.';
        } else if (errorJson.response?.message) {
          errorDetails = Array.isArray(errorJson.response.message) 
            ? errorJson.response.message.join(', ')
            : errorJson.response.message;
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(errorDetails);
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

    const resolved = resolveEvolutionConfig(evolutionApiUrlRaw, instanceNameRaw);

    if (!resolved) {
      console.error('Invalid Evolution configuration (could not resolve URL + instance slug).');
      return new Response(
        JSON.stringify({
          error: 'Invalid Evolution configuration',
          details:
            'Check your backend secrets: EVOLUTION_API_URL must be the base URL (https://...), and EVOLUTION_INSTANCE_NAME must be the instance slug (example: "minha-instancia"), not a URL.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (resolved.swapped) {
      console.warn('Evolution config appears swapped; auto-correcting EVOLUTION_API_URL/EVOLUTION_INSTANCE_NAME.');
    }

    const evolutionApiUrl = resolved.evolutionApiUrl;
    const instanceName = resolved.instanceName;

    // Guardrail: instance name must be a slug, not a URL
    if (isLikelyUrl(instanceName)) {
      console.error('Invalid EVOLUTION_INSTANCE_NAME (looks like URL).');
      return new Response(
        JSON.stringify({
          error: 'Invalid Evolution configuration',
          details:
            'EVOLUTION_INSTANCE_NAME must be the instance slug (example: "minha-instancia"), not a URL.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { eventId, messageType, customMessage } = await req.json();

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: 'eventId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the event
    const { data: event, error: fetchError } = await supabase
      .from('agenda_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !event) {
      console.error('Error fetching event:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let message: string;

    if (customMessage) {
      message = customMessage;
    } else if (messageType === '2h') {
      message = `Acabei de finalizar o conteúdo da nossa reunião, agendada para às ${event.event_time.slice(0, 5)} de hoje.\n\nNos vemos em breve! 🚀`;
    } else if (messageType === '30min') {
      message = `Em 30 minutos te envio o link de acesso.`;
      if (event.meeting_link) {
        message += `\n\n🔗 Link da reunião: ${event.meeting_link}`;
      }
    } else {
      // Default reminder message
      message = `Olá ${event.client_name}! 📅\n\nLembrete da sua reunião:\n\n📌 ${event.title}\n📆 ${event.event_date}\n⏰ ${event.event_time.slice(0, 5)}`;
      if (event.meeting_link) {
        message += `\n\n🔗 Link: ${event.meeting_link}`;
      }
      message += '\n\nTe aguardo! 😊';
    }

    console.log(`Sending manual reminder for event: ${event.title} to ${event.client_phone}`);

    let sendError: string | null = null;
    try {
      await sendWhatsAppMessage(
        event.client_phone,
        message,
        evolutionApiUrl,
        evolutionApiKey,
        instanceName
      );
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'Erro desconhecido ao enviar mensagem';
    }

    if (sendError) {
      return new Response(
        JSON.stringify({ error: sendError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update reminder status if specific type was sent
    if (messageType === '2h') {
      await supabase
        .from('agenda_events')
        .update({ reminder_2h_sent: true })
        .eq('id', eventId);
    } else if (messageType === '30min') {
      await supabase
        .from('agenda_events')
        .update({ reminder_30min_sent: true })
        .eq('id', eventId);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Reminder sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in send-manual-reminder:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
