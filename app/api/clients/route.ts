import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import {
  type AuthenticatedUser,
  getCurrentUser,
  scopeClientWhere,
} from "@/lib/authorization"
import { formatLocalDateInput } from "@/lib/date-input"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/safe-logger"
import {
  clientPayloadSchema,
  getClientValidationMessage,
} from "@/lib/validations/client.schema"

function buildClientFilters(searchParams: URLSearchParams) {
  const search = searchParams.get("search")?.trim() ?? ""
  const status = searchParams.get("status")
  const metaStatus = searchParams.get("metaStatus")
  const filters: Prisma.ClientWhereInput[] = []

  if (search) {
    filters.push({
      OR: [
        {
          name: {
            contains: search,
          },
        },
        {
          company: {
            contains: search,
          },
        },
      ],
    })
  }

  if (status === "ACTIVE" || status === "INACTIVE") {
    filters.push({ status })
  }

  if (metaStatus === "CONNECTED") {
    filters.push({
      NOT: {
        OR: [{ adAccountId: null }, { adAccountId: "" }],
      },
    })
  }

  if (metaStatus === "DISCONNECTED") {
    filters.push({
      OR: [{ adAccountId: null }, { adAccountId: "" }],
    })
  }

  return filters
}

async function fetchClients(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  searchParams: URLSearchParams
) {
  const filters = buildClientFilters(searchParams)

  return prisma.client.findMany({
    where: scopeClientWhere(user, filters.length > 0 ? { AND: filters } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      campaigns: {
        select: {
          id: true,
        },
      },
    },
  })
}

function escapeCsvValue(value: string | number) {
  const stringValue = String(value)
  const escapedValue = stringValue.replace(/"/g, '""')
  return `"${escapedValue}"`
}

function serializeClientsToCsv(
  clients: Awaited<ReturnType<typeof fetchClients>>
) {
  const header = [
    "Nome",
    "Empresa",
    "Email",
    "Telefone",
    "Status cadastro",
    "Status META",
    "Conta META ID",
    "Conta META nome",
    "Grupo WhatsApp",
    "Campanhas",
    "Cadastrado em",
  ]

  const rows = clients.map((client) =>
    [
      client.name,
      client.company ?? "",
      client.email ?? "",
      client.phone ?? "",
      client.status,
      client.adAccountId ? "Conectado" : "Não conectado",
      client.adAccountId ?? "",
      client.adAccountName ?? "",
      client.whatsappGroupId ?? "",
      client.campaigns.length,
      new Date(client.createdAt).toLocaleDateString("pt-BR"),
    ]
      .map(escapeCsvValue)
      .join(",")
  )

  return [header.map(escapeCsvValue).join(","), ...rows].join("\n")
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format")
    const clients = await fetchClients(user, searchParams)

    if (format === "csv") {
      const csv = serializeClientsToCsv(clients)
      const dateStamp = formatLocalDateInput(new Date())

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="clientes-${dateStamp}.csv"`,
        },
      })
    }

    return NextResponse.json(clients)
  } catch (error) {
    logError("clients.get", error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json()

    const parsedClient = clientPayloadSchema.safeParse(body)
    if (!parsedClient.success) {
      return NextResponse.json(
        { error: getClientValidationMessage(parsedClient.error) },
        { status: 400 }
      )
    }

    const clientData = parsedClient.data
    const client = await prisma.client.create({
      data: {
        name: clientData.name,
        company: clientData.company ?? null,
        email: clientData.email ?? null,
        phone: clientData.phone ?? null,
        notes: clientData.notes ?? null,
        whatsappGroupId: clientData.whatsappGroupId ?? null,
        adAccountId: clientData.adAccountId ?? null,
        adAccountName: clientData.adAccountName ?? null,
        status: clientData.status ?? "ACTIVE",
        managerId: user.id,
      },
    })
    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    logError("clients.create", error)
    return NextResponse.json(
      { error: "Erro ao criar cliente" },
      { status: 500 }
    )
  }
}
