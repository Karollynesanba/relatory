export type EvolutionGroup = {
  id: string
  subject: string
  subjectOwner?: string | null
  size: number
  announce: boolean
  instance: string
  participants?: unknown[]
}

export type EvolutionInstance = {
  name: string
  status: string | null
  isPrimary: boolean
}

export type EvolutionSettingsResponse = {
  configured: boolean
  connected: boolean
  instance: string | null
  selectedInstance: string | null
  previewInstance?: string | null
  detail: string | null
  groups: EvolutionGroup[]
  instances: EvolutionInstance[]
}
