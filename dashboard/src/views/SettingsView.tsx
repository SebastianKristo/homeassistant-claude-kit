import { useState, useEffect } from "react";
import { useHass, useUser } from "@hakit/core";
import { callService } from "home-assistant-js-websocket";
import {
  MOTION_TIMEOUTS,
  TRANSITIONS,
  CLIMATE_SETTINGS,
} from "./settings-constants";
import {
  SettingSection,
  SubSection,
  NumberRow,
} from "../components/controls/SettingControls";
import { InfrastructureCard } from "../components/cards/InfrastructureCard";

const ADVANCED_KEY = "ha-dashboard:settings-advanced";

export function SettingsView() {
  const connection = useHass((s) => s.connection);
  const user = useUser();
  const isAdmin = user?.is_admin ?? false;

  const [showAdvanced, setShowAdvanced] = useState(
    () => localStorage.getItem(ADVANCED_KEY) === "true",
  );

  useEffect(() => {
    localStorage.setItem(ADVANCED_KEY, String(showAdvanced));
  }, [showAdvanced]);

  const setNumber = (entityId: string, value: number) => {
    if (!connection) return;
    callService(connection, "input_number", "set_value", { value }, { entity_id: entityId });
  };

  // suppress unused warning until advanced features are used
  void showAdvanced;

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      {/* Header with Advanced toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Settings</h1>
        {isAdmin && (
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              showAdvanced
                ? "bg-accent-warm/20 text-accent-warm"
                : "bg-white/10 text-text-dim hover:text-text-secondary"
            }`}
          >
            Advanced
          </button>
        )}
      </div>

      {/* Motion / Lighting timeouts */}
      <SettingSection title="Bevegelses-timeouts" icon="mdi:motion-sensor" defaultExpanded>
        <SubSection title="Normale timeouts">
          {MOTION_TIMEOUTS.map((c) => (
            <NumberRow key={c.entity} config={c} onChange={setNumber} />
          ))}
        </SubSection>
        <SubSection title="Overganger">
          {TRANSITIONS.map((c) => (
            <NumberRow key={c.entity} config={c} onChange={setNumber} />
          ))}
        </SubSection>
      </SettingSection>

      {/* Climate */}
      <SettingSection title="Temperaturmål" icon="mdi:thermometer">
        {CLIMATE_SETTINGS.map((c) => (
          <NumberRow key={c.entity} config={c} onChange={setNumber} />
        ))}
      </SettingSection>

      {/* Infrastructure */}
      <SettingSection title="Infrastruktur" icon="mdi:server-network">
        <InfrastructureCard />
      </SettingSection>

      <div className="h-20" />
    </div>
  );
}
