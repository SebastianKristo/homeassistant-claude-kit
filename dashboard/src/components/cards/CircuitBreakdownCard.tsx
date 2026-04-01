import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState, formatPower } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";

const CIRCUIT_ICONS: Record<string, string> = {
  "Oppvarming":  "mdi:radiator",
  "Stue":        "mdi:sofa",
  "Soverom/Bad": "mdi:bed",
  "Data":        "mdi:server-network",
  "Hvitvarer":   "mdi:washing-machine",
  "Vaskegang":   "mdi:washing-machine",
  "Kjøkken":     "mdi:knife",
  "Lys":         "mdi:lightbulb",
  "Gang/Bod":    "mdi:door",
};

type TabType = "power" | "monthly";

interface Props { config: EnergyConfig; defaultTab?: TabType; }

export function CircuitBreakdownCard({ config }: Props) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const circuits = config.circuits.map((c) => ({
    ...c,
    powerW: parseNumericState(entities[c.powerEntity]?.state),
    monthlyCost: parseNumericState(entities[c.monthlyEntity]?.state),
  }));

  const byPower = [...circuits]
    .filter((c) => c.powerW !== null)
    .sort((a, b) => (b.powerW ?? 0) - (a.powerW ?? 0));

  const byCost = [...circuits]
    .filter((c) => c.monthlyCost !== null)
    .sort((a, b) => (b.monthlyCost ?? 0) - (a.monthlyCost ?? 0));

  const maxW = Math.max(...byPower.map((c) => c.powerW ?? 0), 1);
  const maxCost = Math.max(...byCost.map((c) => c.monthlyCost ?? 0), 1);

  return (
    <div className="rounded-2xl bg-bg-card overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/6 flex items-center justify-between">
        <span className="text-sm font-medium">Kursfordeling</span>
      </div>

      {/* Power view */}
      <div className="px-4 py-3 space-y-2">
        <div className="text-xs text-text-dim mb-1">Nåværende effekt</div>
        {byPower.map((c) => (
          <CircuitRow
            key={c.name}
            name={c.name}
            icon={CIRCUIT_ICONS[c.name] ?? "mdi:flash"}
            value={formatPower(c.powerW ?? 0)}
            ratio={(c.powerW ?? 0) / maxW}
            barColor="bg-accent"
          />
        ))}
        {byPower.length === 0 && (
          <p className="text-xs text-text-dim py-2">Ingen kurs rapporterer effekt nå</p>
        )}
      </div>

      {/* Monthly cost */}
      <div className="px-4 pb-4 pt-2 border-t border-white/6 space-y-2">
        <div className="text-xs text-text-dim mb-1">Månedskostnad</div>
        {byCost.map((c) => (
          <CircuitRow
            key={c.name}
            name={c.name}
            icon={CIRCUIT_ICONS[c.name] ?? "mdi:flash"}
            value={`${(c.monthlyCost ?? 0).toFixed(0)} kr`}
            ratio={(c.monthlyCost ?? 0) / maxCost}
            barColor="bg-accent-violet"
          />
        ))}
      </div>
    </div>
  );
}

function CircuitRow({
  name, icon, value, subValue, ratio, barColor,
}: {
  name: string; icon: string; value: string; subValue?: string;
  ratio: number; barColor: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon icon={icon} width={14} className="shrink-0 text-text-dim" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary truncate">{name}</span>
          <div className="text-right">
            <span className="text-xs tabular-nums font-medium">{value}</span>
            {subValue && <span className="ml-1.5 text-[10px] text-text-dim">{subValue}</span>}
          </div>
        </div>
        <div className="h-1 rounded-full bg-white/6 overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
