import { NextResponse } from "next/server"
import {
  type AuthenticatedUser,
  canAccessClient,
  getCurrentUser,
} from "@/lib/authorization"
import { loadEvolutionCatalog } from "@/lib/evolution-api"
import { resolveUserEvolutionInstance } from "@/lib/evolution-preference"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/safe-logger"
import { normalizeWhatsAppGroupId } from "@/lib/whatsapp-group"
import {
  clientPayloadSchema,
  getClientValidationMessage,
} from "@/lib/validations/client.schema"

function parseClientWhatsAppGroupTarget(value: string | null | undefined) {
  const rawValue = value?.trim()

  if (!rawValue) {
    return null
  }

  const separatorIndex = rawValue.indexOf("::")
  const instance =
    separatorIndex >= 0 ? rawValue.slice(0, separatorIndex).trim() : null
  const groupId =
    separatorIndex >= 0
      ? rawValue.slice(separatorIndex + 2).trim()
      : rawValue
  const normalizedGroupId = normalizeWhatsAppGroupId(groupId)

  if (!normalizedGroupId) {
    return null
  }

  return {
    groupId: normalizedGroupId,
    instance: instance || null,
  }
}

async function assertClientGroupBelongsToUserInstance(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  whatsappGroupId: string | null | undefined
) {
  const target = parseClientWhatsAppGroupTarget(whatsappGroupId)

  if (!target) {
    return
  }

  const userInstance = await resolveUserEvolutionInstance(user)

  if (!userInstance) {
    throw new Error(
      "Sua conta nao possui uma instancia Evolution configurada para validar grupos."
    )
  }

  if (target.instance && target.instance !== userInstance) {
    throw new Error(
      "O grupo selecionado nao pertence a instancia Evolution desta conta."
    )
  }

  const catalog = await loadEvolutionCatalog({ groupInstances: [userInstance] })
  const matchesUserInstance = catalog.groups.some(
    (group) => group.id === target.groupId
  )

  if (!matchesUserInstance) {
    throw new Error(
      "O grupo selecionado nao pertence a instancia Evolution desta conta."
    )
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      include: { campaigns: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    if (!canAccessClient(user, client.managerId)) {
      return NextResponse.json({ error: "Acesso negado a este cliente" }, { status: 403 })
    }

    return NextResponse.json(client)
  } catch (error) {
    logError("client.get", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsedClient = clientPayloadSchema.safeParse(body)
    const existingClient = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        managerId: true,
      },
    })

    if (!existingClient) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    if (!canAccessClient(user, existingClient.managerId)) {
      return NextResponse.json({ error: "Acesso negado a este cliente" }, { status: 403 })
    }

    if (!parsedClient.success) {
      return NextResponse.json(
        { error: getClientValidationMessage(parsedClient.error) },
        { status: 400 }
      )
    }

    const clientData = parsedClient.data
    await assertClientGroupBelongsToUserInstance(user, clientData.whatsappGroupId)
    const client = await prisma.client.update({
      where: { id },
      data: {
        name: clientData.name,
        company: clientData.company ?? null,
        email: clientData.email ?? null,
        phone: clientData.phone ?? null,
        notes: clientData.notes ?? null,
        whatsappGroupId: clientData.whatsappGroupId ?? null,
        status: clientData.status,
      },
    })

    return NextResponse.json(client)
  } catch (error) {
    logError("client.update", error)
    const message = error instanceof Error ? error.message : "Erro interno"
    const status = message.includes("instancia Evolution") || message.includes("pertence")
      ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const existingClient = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        managerId: true,
        name: true,
      },
    })

    if (!existingClient) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    if (!canAccessClient(user, existingClient.managerId)) {
      return NextResponse.json({ error: "Acesso negado a este cliente" }, { status: 403 })
    }

    await prisma.client.delete({
      where: { id },
    })

    return NextResponse.json({
      ok: true,
      message: `Cliente ${existingClient.name} excluído com sucesso.`,
    })
  } catch (error) {
    logError("client.delete", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
