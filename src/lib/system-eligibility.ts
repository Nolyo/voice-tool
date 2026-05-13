export interface SystemInfo {
  total_ram_gb: number;
  has_discrete_gpu: boolean;
  gpu_name: string | null;
}

/**
 * Local transcription is only viable when whisper large-v3-turbo can run with
 * acceptable latency. Empirically that requires either a discrete GPU (Vulkan/
 * DX12) or ≥ 32 GB of RAM on CPU. Below this threshold the user-perceived
 * experience is so degraded that the app feels broken — so we route them to
 * Cloud at onboarding time.
 */
export function isLocalEligible(info: SystemInfo): boolean {
  return info.has_discrete_gpu || info.total_ram_gb >= 32;
}
