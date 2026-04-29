-- Bound user-controlled metadata columns to prevent oversized payloads
-- (e.g. spoofed clients) from bloating the table or breaking UI display.
-- Source: docs/superpowers/plans/2026-04-26-v3-post-review-fixes.md (Task 14, Step 4).
--
-- Values populated by the desktop client via `get_device_info` Tauri command:
--   - app_version: env!("CARGO_PKG_VERSION") — semver, in practice <= 30 chars.
--   - os_name / os_version: sysinfo::System::{name, os_version} — vendor-defined, in
--     practice <= 50 chars but capped at 100 for safety.

alter table public.user_devices
  add constraint user_devices_os_name_len check (char_length(os_name) <= 100),
  add constraint user_devices_os_version_len check (char_length(os_version) <= 100),
  add constraint user_devices_app_version_len check (char_length(app_version) <= 50);
