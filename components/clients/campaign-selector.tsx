import { StatusBadge } from "@/components/shared/status-badge"
import { cn } from "@/lib/utils"
import type { ReportCampaign } from "@/types/report.types"

type CampaignSelectorProps = {
  campaigns: ReportCampaign[]
  selectedCampaignIds: string[]
  onToggleCampaign: (campaignId: string) => void
  className?: string
}

function getCampaignTone(status: string) {
  if (status === "ACTIVE") {
    return "success" as const
  }

  if (status === "PAUSED") {
    return "warning" as const
  }

  return "neutral" as const
}

function getCampaignStatusLabel(status: string) {
  if (status === "ACTIVE") {
    return "Ativa"
  }

  if (status === "PAUSED") {
    return "Pausada"
  }

  return status
}

export function CampaignSelector({
  campaigns,
  selectedCampaignIds,
  onToggleCampaign,
  className,
}: CampaignSelectorProps) {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE")

  if (activeCampaigns.length === 0) {
    return null
  }

  return (
    <div className={cn("space-y-2", className)}>
      {activeCampaigns.map((campaign) => (
        <label
          key={campaign.id}
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100"
        >
          <input
            type="checkbox"
            checked={selectedCampaignIds.includes(campaign.id)}
            onChange={() => onToggleCampaign(campaign.id)}
            className="accent-[#C1121F]"
          />
          <span className="flex-1 truncate text-xs font-medium text-slate-700">
            {campaign.name}
          </span>
          <StatusBadge tone={getCampaignTone(campaign.status)} className="px-2 py-1">
            {getCampaignStatusLabel(campaign.status)}
          </StatusBadge>
        </label>
      ))}
    </div>
  )
}
