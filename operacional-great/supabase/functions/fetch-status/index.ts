import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StatusComponent {
  id: string;
  name: string;
  status: string;
  description?: string;
}

interface StatusResponse {
  page: {
    name: string;
    url: string;
    updated_at: string;
  };
  status: {
    indicator: string;
    description: string;
  };
  components: StatusComponent[];
}

type ServiceType = "openai" | "cloudflare" | "evolution";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeEvolutionBaseUrl(raw: string): string {
  let base = raw.trim();
  // Fix common typo: https:/example.com -> https://example.com
  base = base.replace(/^https?:\/(?!\/)/i, (m) => m + "/");
  base = base.replace(/\/+$/, "");
  // Some providers expose a /manager UI; API base is the root URL
  base = base.replace(/\/manager$/i, "");
  return base;
}

async function getEvolutionConnectionStatus() {
  const evolutionApiUrlRaw = Deno.env.get("EVOLUTION_API_URL");
  const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instanceNameRaw =
    Deno.env.get("EVOLUTION_INSTANCE_NAME") ?? Deno.env.get("EVOLUTION_INSTANCE");

  if (!evolutionApiUrlRaw || !evolutionApiKey || !instanceNameRaw) {
    throw new Error("Evolution API not configured");
  }

  const evolutionApiUrl = normalizeEvolutionBaseUrl(evolutionApiUrlRaw);
  const instanceName = instanceNameRaw.trim();

  // Evolution API: most common endpoint
  const endpoint = `${evolutionApiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: evolutionApiKey,
    },
  });

  const raw = await response.text();
  const json = safeJsonParse<Record<string, unknown>>(raw);

  // Heuristics across Evolution versions
  const connectedFromJson = (json as any)?.connected;
  const state =
    (json as any)?.instance?.state ??
    (json as any)?.state ??
    (json as any)?.status ??
    (json as any)?.connectionState;

  const normalizedState = typeof state === "string" ? state.toLowerCase() : "";
  const connected =
    typeof connectedFromJson === "boolean"
      ? connectedFromJson
      : ["open", "connected", "online", "ready"].includes(normalizedState);

  return {
    service: "Evolution",
    connected,
    instanceName,
    endpoint,
    httpStatus: response.status,
    raw: json ?? raw,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const body = safeJsonParse<{ service?: ServiceType }>(bodyText) ?? {};
    const service = body.service;

    let statusUrl: string;
    let serviceName: string;

    switch (service) {
      case "evolution": {
        const evo = await getEvolutionConnectionStatus();
        return new Response(JSON.stringify(evo), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "openai":
        statusUrl = "https://status.openai.com/api/v2/summary.json";
        serviceName = "OpenAI";
        break;
      case "cloudflare":
        statusUrl = "https://www.cloudflarestatus.com/api/v2/summary.json";
        serviceName = "Cloudflare";
        break;
      default:
        throw new Error(`Unknown service: ${service}`);
    }

    console.log(`Fetching status for ${serviceName} from ${statusUrl}`);

    const response = await fetch(statusUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Great-ERP-Monitor/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${serviceName} status: ${response.status}`);
    }

    const data: StatusResponse = await response.json();

    // Normalize the response
    const normalizedComponents = data.components?.map((comp) => ({
      id: comp.id,
      name: comp.name,
      status: normalizeStatus(comp.status),
      rawStatus: comp.status,
    })) || [];

    const result = {
      service: serviceName,
      overallStatus: normalizeStatus(data.status?.indicator || "unknown"),
      description: data.status?.description || "Status unknown",
      lastUpdated: data.page?.updated_at || new Date().toISOString(),
      components: normalizedComponents,
    };

    console.log(`${serviceName} status fetched successfully:`, result.overallStatus);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching status:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        service: "unknown",
        overallStatus: "error",
        description: "Failed to fetch status",
        lastUpdated: new Date().toISOString(),
        components: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function normalizeStatus(status: string): "operational" | "degraded" | "outage" | "unknown" {
  const statusLower = status?.toLowerCase() || "";
  
  if (statusLower === "none" || statusLower === "operational") {
    return "operational";
  }
  if (statusLower.includes("minor") || statusLower.includes("degraded") || statusLower.includes("partial")) {
    return "degraded";
  }
  if (statusLower.includes("major") || statusLower.includes("critical") || statusLower.includes("outage")) {
    return "outage";
  }
  return "unknown";
}
