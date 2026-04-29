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

#[derive(Serialize)]
pub struct DeviceInfo {
    pub app_version: String,
    pub os_name: String,
    pub os_version: String,
}

#[tauri::command]
pub fn get_device_info() -> DeviceInfo {
    DeviceInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_info_app_version_matches_cargo_pkg() {
        let info = get_device_info();
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
        assert!(!info.app_version.is_empty(), "app_version must not be empty");
        // user_devices_app_version_len constraint: <= 50 chars.
        assert!(
            info.app_version.chars().count() <= 50,
            "app_version length must fit DB constraint (50 chars)"
        );
    }

    #[test]
    fn device_info_os_fields_present() {
        let info = get_device_info();
        // sysinfo may return "Unknown" on minimal/sandboxed environments — accept that
        // but never an empty string (we always coerce to "Unknown").
        assert!(!info.os_name.is_empty(), "os_name must never be empty");
        assert!(!info.os_version.is_empty(), "os_version must never be empty");
    }
}
