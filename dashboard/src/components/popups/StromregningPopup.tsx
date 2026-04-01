import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import {
  STROMREGNING_DAILY,
  STROMREGNING_MONTHLY,
  STROMREGNING_YEARLY,
  STROMREGNING_TOTAL_MONTH,
  STROMREGNING_TOTAL_YEAR,
  CIRCUIT_COSTS,
} from "../../lib/entities";
import { BottomSheet } from "./BottomSheet";

type Period = "dag" | "maned";

interface StromregningPopupProps {
  open: boolean;
  onClose: () => void;
}

export function StromregningPopup({ open, onClose }: StromregningPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [period, setPeriod] = useState<Period>("dag");

  const daily      = parseNumericState(entities[STROMREGNING_DAILY]?.state);
  const monthly    = parseNumericState(entities[STROMREGNING_MONTHLY]?.state);
  const yearly     = parseNumericState(entities[STROMREGNING_YEARLY]?.state);
  const totalMonth = parseNumericState(entities[STROMREGNING_TOTAL_MONTH]?.state);
  const totalYear  = parseNumericState(entities[STROMREGNING_TOTAL_YEAR]?.state);

  const monthVal = monthly ?? totalMonth;
  const yearVal  = yearly  ?? totalYear;

  const circuits = CIRCUIT_COSTS.map((c) => {
    const entity = period === "dag" ? c.daily : c.monthly;
    const cost   = entity ? parseNumericState(entities[entity]?.state) : null;
    return { ...c, cost };
  }).filter((c) => c.cost !== null && c.cost > 0)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));

  const maxCost = circuits[0]?.cost ?? 1;
  const circuitTotal = circuits.reduce((s, c) => s + (c.cost ?? 0), 0);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Strømregning</Dialog.Title>
      <Dialog.Description className="sr-only">Oversikt over strømkostnader per kurs</Dialog.Description>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-2 pt-1">
          <Icon icon="mdi:lightning-bolt-circle" width={20} className="text-accent-warm" />
          <span className="text-lg font-semibold">Strømregning</span>
        </div>

        {/* Period totals */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-bg-card px-3 py-4 text-center">
            <div className="text-xs text-text-dim mb-2">I dag</div>
            <div className="text-2xl font-bold tabular-nums">
              {daily !== null ? daily.toFixed(0) : "—"}
            </div>
            <div className="text-xs text-text-dim mt-0.5">kr</div>
          </div>
          <div className="rounded-2xl bg-bg-card px-3 py-4 text-center">
            <div className="text-xs text-text-dim mb-2">Denne mnd</div>
            <div className="text-2xl font-bold tabular-nums">
              {monthVal !== null ? monthVal.toFixed(0) : "—"}
            </div>
            <div className="text-xs text-text-dim mt-0.5">kr</div>
          </div>
          <div className="rounded-2xl bg-bg-card px-3 py-4 text-center">
            <div className="text-xs text-text-dim mb-2">I år</div>
            <div className="text-2xl font-bold tabular-nums">
              {yearVal !== null ? (yearVal / 1000).toFixed(1) + "k" : "—"}
            </div>
            <div className="text-xs text-text-dim mt-0.5">kr</div>
          </div>
        </div>

        {/* Circuit breakdown */}
        <div className="rounded-2xl bg-bg-card overflow-hidden">
          {/* Section header with period toggle */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/6">
            <span className="text-sm font-medium">Per kurs</span>
            <div className="flex rounded-xl bg-bg-elevated overflow-hidden text-xs">
              <button
                onClick={() => setPeriod("dag")}
                className={`px-3 py-1 transition-colors ${period === "dag" ? "bg-accent text-white font-medium" : "text-text-dim hover:text-text-secondary"}`}
              >
                I dag
              </button>
              <button
                onClick={() => setPeriod("maned")}
                className={`px-3 py-1 transition-colors ${period === "maned" ? "bg-accent text-white font-medium" : "text-text-dim hover:text-text-secondary"}`}
              >
                Denne mnd
              </button>
            </div>
          </div>

          {circuits.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {circuits.map(({ name, icon, cost }) => (
                <div key={name} className="flex items-center gap-3 px-4 py-3">
                  <Icon icon={icon} width={15} className="shrink-0 text-text-dim" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary">{name}</span>
                      <span className="text-xs font-semibold tabular-nums">{cost!.toFixed(2)} kr</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-warm/70 transition-all duration-500"
                        style={{ width: `${Math.min(100, (cost! / maxCost) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02]">
                <span className="text-xs text-text-dim">Totalt (målte kurser)</span>
                <span className="text-xs font-semibold tabular-nums text-accent-warm">
                  {circuitTotal.toFixed(2)} kr
                </span>
              </div>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-text-dim">
              Ingen kursdata tilgjengelig
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
