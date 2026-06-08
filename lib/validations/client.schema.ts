import { z } from "zod"

const CLIENT_NAME_MAX_LENGTH = 120
const CLIENT_COMPANY_MAX_LENGTH = 120
const CLIENT_EMAIL_MAX_LENGTH = 160
const CLIENT_PHONE_MAX_LENGTH = 25
const CLIENT_NOTES_MAX_LENGTH = 1000
const CLIENT_WHATSAPP_GROUP_MAX_LENGTH = 120
const CLIENT_AD_ACCOUNT_NAME_MAX_LENGTH = 120

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : value
}

function isValidWhatsAppGroupId(value: string) {
  return /^(?:(?:[^:\s][^:]*?)::)?(?:\d{10,25}-\d+|\d{12,30})@g\.us$/i.test(value)
}

function optionalTrimmedString(maxLength: number, label: string) {
  return z.preprocess(
    (value) => {
      const trimmed = trimString(value)
      return trimmed === "" ? undefined : trimmed
    },
    z
      .string()
      .max(maxLength, {
        message: `${label} deve ter no maximo ${maxLength} caracteres`,
      })
      .optional()
  )
}

export const clientPayloadSchema = z
  .object({
    name: z.preprocess(
      trimString,
      z
        .string()
        .min(3, { message: "Nome do cliente deve ter pelo menos 3 caracteres" })
        .max(CLIENT_NAME_MAX_LENGTH, {
          message: `Nome do cliente deve ter no maximo ${CLIENT_NAME_MAX_LENGTH} caracteres`,
        })
    ),
    company: optionalTrimmedString(CLIENT_COMPANY_MAX_LENGTH, "Empresa"),
    email: z.preprocess(
      (value) => {
        const trimmed = trimString(value)
        return trimmed === "" ? undefined : trimmed
      },
      z
        .string()
        .email({ message: "E-mail inválido" })
        .max(CLIENT_EMAIL_MAX_LENGTH, {
          message: `E-mail deve ter no maximo ${CLIENT_EMAIL_MAX_LENGTH} caracteres`,
        })
        .optional()
    ),
    phone: optionalTrimmedString(CLIENT_PHONE_MAX_LENGTH, "Telefone"),
    notes: optionalTrimmedString(CLIENT_NOTES_MAX_LENGTH, "Observacoes"),
    whatsappGroupId: optionalTrimmedString(
      CLIENT_WHATSAPP_GROUP_MAX_LENGTH,
      "Grupo do WhatsApp"
    ),
    adAccountId: optionalTrimmedString(32, "Conta META"),
    adAccountName: optionalTrimmedString(
      CLIENT_AD_ACCOUNT_NAME_MAX_LENGTH,
      "Nome da conta META"
    ),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.phone) {
      if (!/^[0-9()+\-\s]+$/.test(data.phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: "Telefone deve conter apenas numeros e simbolos comuns",
        })
      }

      const digits = data.phone.replace(/\D/g, "")
      if (digits.length < 10 || digits.length > 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: "Telefone deve ter entre 10 e 15 digitos",
        })
      }
    }

    if (data.whatsappGroupId && !isValidWhatsAppGroupId(data.whatsappGroupId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whatsappGroupId"],
        message:
          "ID do grupo WhatsApp deve seguir um formato valido, como 120363407411420148@g.us",
      })
    }

    if (!!data.adAccountId !== !!data.adAccountName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adAccountId"],
        message: "Conta META deve ter ID e nome preenchidos juntos",
      })
    }
  })

export type ClientPayload = z.infer<typeof clientPayloadSchema>

export function getClientValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Dados do cliente inválidos"
}
