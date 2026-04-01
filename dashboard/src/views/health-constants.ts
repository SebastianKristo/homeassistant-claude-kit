/** Platforms whose battery sensors aren't home-automation devices */
export const EXCLUDED_BATTERY_PLATFORMS = new Set([
  "mobile_app",    // phones, tablets
  "tesla_fleet",   // car
  "roborock",      // vacuum
  "dreame",        // vacuum
  "ecovacs",       // vacuum
  "valetudo",      // vacuum
]);

export const MONITORED_INTEGRATIONS: Array<{ name: string; entity: string; icon: string }> = [
  { name: "Norgespris",  entity: "sensor.norgespris_pris_na",          icon: "mdi:lightning-bolt" },
  { name: "Zaptec",      entity: "binary_sensor.elbillader_online",    icon: "mdi:ev-station" },
  { name: "Weather",     entity: "weather.forecast_home",              icon: "mdi:weather-partly-cloudy" },
  { name: "Proxmox",     entity: "sensor.pve_status",                  icon: "mdi:server" },
];

export const STALE_SENSORS: string[] = [
  "sensor.strommaler_effekt_kw",
  "sensor.vaervarsel_temperatur",
];

export const HEALTH_AUTOMATIONS: Array<{ entity: string; label: string }> = [
  // Add real automation entity IDs here once confirmed in HA.
  // e.g. { entity: "automation.varsling_lavt_batteri", label: "Low Battery Alert" },
];

export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BatteryInfo {
  name: string;
  level: number;
  entityId: string;
}
