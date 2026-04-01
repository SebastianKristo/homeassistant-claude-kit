import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { ModeButton } from "../controls/ModeButton";
import type { QuickActionsConfig } from "../../lib/entities";

interface QuickActionsProps {
  config: QuickActionsConfig;
}

export function QuickActions({ config }: QuickActionsProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const timeOfDay = entities[config.timeOfDay]?.state ?? "day";

  // Context-aware: only show relevant actions
  const isEvening = timeOfDay === "evening" || timeOfDay === "night";
  const projector = entities[config.projector];
  const projectorAvailable = projector && projector.state !== "unavailable";

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {isEvening && (
        <ModeButton
          entityId={config.nightMode}
          label="Natt"
          icon="mdi:weather-night"
          activeColor="bg-indigo-600"
        />
      )}
      {projectorAvailable && (
        <ModeButton
          entityId={config.movieMode}
          label="Film"
          icon="mdi:movie-open"
          activeColor="bg-purple-600"
        />
      )}
      <ModeButton
        entityId={config.homeMode}
        label="Hjemme"
        icon="mdi:home-heart"
        activeColor="bg-teal-600"
      />
      <ModeButton
        entityId={config.workMode}
        label="Arbeid"
        icon="mdi:desk"
        activeColor="bg-blue-600"
      />
      <ModeButton
        entityId={config.awayMode}
        label="Vekk"
        icon="mdi:home-export-outline"
        activeColor="bg-orange-600"
      />
      <ModeButton
        entityId={config.ferieMode}
        label="Ferie"
        icon="mdi:beach"
        activeColor="bg-yellow-600"
      />
    </div>
  );
}
