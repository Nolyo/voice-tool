use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemInfo {
    pub total_ram_gb: f64,
    pub has_discrete_gpu: bool,
    pub gpu_name: Option<String>,
}

#[tauri::command]
pub async fn get_system_info() -> SystemInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    let total_ram_gb = sys.total_memory() as f64 / 1_073_741_824.0;

    let (has_discrete_gpu, gpu_name) = detect_discrete_gpu();

    SystemInfo {
        total_ram_gb,
        has_discrete_gpu,
        gpu_name,
    }
}

fn detect_discrete_gpu() -> (bool, Option<String>) {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::VULKAN | wgpu::Backends::DX12,
        ..Default::default()
    });

    let adapters: Vec<_> = instance
        .enumerate_adapters(wgpu::Backends::VULKAN | wgpu::Backends::DX12)
        .into_iter()
        .collect();

    let discrete = adapters
        .iter()
        .find(|a| a.get_info().device_type == wgpu::DeviceType::DiscreteGpu);

    match discrete {
        Some(a) => (true, Some(a.get_info().name)),
        None => (false, None),
    }
}
