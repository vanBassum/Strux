import { useEffect, useState } from "react"
import { backend, type ConnectionStatus } from "@/lib/backend"

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(backend.status)

  useEffect(() => backend.onStatusChange(setStatus), [])

  return status
}
