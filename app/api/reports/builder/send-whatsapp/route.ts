import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/authorization"
import { sendWhatsAppDocument } from "@/lib/evolution-api"
import { resolveUserEvolutionInstance } from "@/lib/evolution-preference"
import { logError } from "@/lib/safe-logger"
import { normalizeWhatsAppGroupId } from "@/lib/whatsapp-group"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type BuilderSendWhatsAppRequest = {
  destination?: string
  message?: string
  pdfBase64?: string
  pdfFileName?: string
}

function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

function normalizeWhatsAppDestinationInput(value: string | undefined) {
  const rawValue = value?.trim()

  if (!rawValue) {
    return null
  }

  const separatorIndex = rawValue.indexOf("::")
  const instance =
    separatorIndex >= 0 ? rawValue.slice(0, separatorIndex).trim() : null
  const destinationValue =
    separatorIndex >= 0 ? rawValue.slice(separatorIndex + 2).trim() : rawValue

  const groupId = normalizeWhatsAppGroupId(destinationValue)
  if (groupId) {
    return {
      destination: instance ? `${instance}::${groupId}` : groupId,
    }
  }

  const phoneNumber = normalizeWhatsAppNumber(destinationValue)
  if (phoneNumber) {
    return {
      destination: instance ? `${instance}::${phoneNumber}` : phoneNumber,
    }
  }

  return null
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as BuilderSendWhatsAppRequest
    const normalizedDestination = normalizeWhatsAppDestinationInput(body.destination)
    const pdfBase64 = body.pdfBase64?.trim()
    const pdfFileName = body.pdfFileName?.trim()

    if (!normalizedDestination) {
      return NextResponse.json(
        {
          error:
            "Informe um grupo da Evolution (ex.: 120363407411420148@g.us) ou um número com DDI.",
        },
        { status: 400 }
      )
    }

    if (!pdfBase64 || !pdfFileName) {
      return NextResponse.json(
        { error: "PDF do relatório não informado para envio." },
        { status: 400 }
      )
    }

    const evolutionInstance = await resolveUserEvolutionInstance(user.id)

    await sendWhatsAppDocument({
      number: normalizedDestination.destination,
      fileName: pdfFileName,
      contentBase64: pdfBase64,
      caption: body.message?.trim() || null,
      instance: evolutionInstance,
    })

    return NextResponse.json({
      ok: true,
      destination: normalizedDestination.destination,
    })
  } catch (error) {
    logError("reports.builder.send-whatsapp", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
