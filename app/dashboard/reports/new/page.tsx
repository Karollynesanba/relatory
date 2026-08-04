import { redirect } from "next/navigation"

export default function NewReportPage() {
  redirect("/dashboard/reports?fresh=1")
}
