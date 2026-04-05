import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";
import { FASTLEDD_MONTHS, FASTLEDD_YEARLY_CLOSED, EFFEKT_TOPP_ENTITIES } from "../../lib/entities";
import { BottomSheet } from "./BottomSheet";

interface EffektleddPopupProps {
  open: boolean;
  onClose: () => void;
  cfg: EnergyConfig;
}

export function EffektleddPopup({ open, onClose, cfg }: EffektleddPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const effektleddKw   = parseNumericState(entities[cfg.effektledd]?.state);
  const cost           = parseNumericState(entities[cfg.effektleddCost]?.state);
  const trinn          = entities[cfg.effektleddCost]?.attributes?.trinn as string | undefined;
  const margin         = parseNumericState(entities[cfg.nextEffektleddThreshold]?.state);
  const yearlyFastledd = parseNumericState(entities[FASTLEDD_YEARLY_CLOSED]?.state);
  const effektTopps    = EFFEKT_TOPP_ENTITIES.map((e) => parseNumericState(entities[e]?.state)).filter((v): v is number => v !== null);

  const marginColor =
    margin === null  ? "text-text-secondary"
    : margin < 0.5   ? "text-accent-red"
    : margin < 2     ? "text-accent-warm"
    : "text-accent-green";

  const marginBg =
    margin === null  ? "bg-white/20"
    : margin < 0.5   ? "bg-accent-red"
    : margin < 2     ? "bg-accent-warm"
    : "bg-accent-green";

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Effektledd</Dialog.Title>
      <Dialog.Description className="sr-only">
        Nåværende effektledd, kostnad og margin til neste trinn
      </Dialog.Description>

      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:flash-triangle" width={20} className="text-accent-warm" />
            <h2 className="text-base font-semibold">Effektledd</h2>
          </div>
          {trinn && (
            <span className="rounded-full bg-accent-warm/15 px-2.5 py-1 text-xs font-semibold text-accent-warm">
              Trinn: {trinn.trim()}
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-bg-card p-4">
            <div className="text-2xl font-bold tabular-nums text-text-primary">
              {effektleddKw !== null ? effektleddKw.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-text-dim mt-1">kW</div>
          </div>
          <div className="rounded-2xl bg-bg-card p-4">
            <div className="text-2xl font-bold tabular-nums text-accent-warm">
              {cost !== null ? cost.toFixed(0) : "—"}
            </div>
            <div className="text-xs text-text-dim mt-1">kr/mnd</div>
          </div>
          <div className="rounded-2xl bg-bg-card p-4">
            <div className={`text-2xl font-bold tabular-nums ${marginColor}`}>
              {margin !== null ? margin.toFixed(1) : "—"}
            </div>
            <div className="text-xs text-text-dim mt-1">kW margin</div>
          </div>
        </div>

        {/* Margin progress */}
        {margin !== null && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Margin til neste trinn</span>
              <span className={`font-semibold tabular-nums ${marginColor}`}>{margin.toFixed(1)} kW</span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${marginBg}`}
                style={{ width: `${Math.min(100, (margin / 5) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-text-dim">
              Marginen er antall kW du kan bruke ekstra denne måneden uten å gå opp et effektledd.
              Effektledd beregnes ut fra det høyeste timegjennomsnittet i løpet av måneden.
            </p>
          </div>
        )}

        {/* Effekt-topper (de 3 høyeste timetoppene) */}
        {effektTopps.length > 0 && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:chart-timeline-variant" width={16} className="text-accent-warm" />
              <span className="text-sm font-semibold">Effekttopper denne måneden</span>
              <span className="text-xs text-text-dim ml-auto">brukes for beregning</span>
            </div>
            <div className="space-y-1.5">
              {effektTopps.map((v, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-text-dim w-5 tabular-nums">#{i + 1}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-warm transition-all duration-500"
                      style={{ width: `${Math.min(100, (v / (effektTopps[0] || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-text-secondary w-14 text-right">{v.toFixed(2)} kW</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-text-dim">
              Snitt av topp {effektTopps.length}: {(effektTopps.reduce((a, b) => a + b, 0) / effektTopps.length).toFixed(2)} kW
            </div>
          </div>
        )}

        {/* Monthly fastledd history */}
        <FastleddMonthly entities={entities} yearlyFastledd={yearlyFastledd} />
      </div>
    </BottomSheet>
  );
}

function FastleddMonthly({ entities, yearlyFastledd }: { entities: HassEntities; yearlyFastledd: number | null }) {
  const currentMonth = new Date().getMonth(); // 0-indexed
  // Only show months up to and including current month
  const values = FASTLEDD_MONTHS.slice(0, currentMonth + 1).map(({ label, entity }, i) => ({
    label,
    value: parseNumericState(entities[entity]?.state),
    isCurrent: i === currentMonth,
    isPast: i < currentMonth,
  }));

  const maxValue = Math.max(...values.map((v) => v.value ?? 0), 1);
  const hasAnyValue = values.some((v) => v.value !== null && v.value > 0);

  if (!hasAnyValue && yearlyFastledd === null) return null;

  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:chart-bar" width={16} className="text-text-secondary" />
          <span className="text-sm font-semibold">Fastledd per måned</span>
        </div>
        {yearlyFastledd !== null && (
          <span className="text-xs text-text-dim">
            Totalt i år: <span className="font-semibold text-text-secondary">{yearlyFastledd.toFixed(0)} kr</span>
          </span>
        )}
      </div>

      {hasAnyValue && (
        <>
          {/* Bar chart */}
          <div className="flex items-end gap-1 h-20">
            {values.map(({ label, value, isCurrent }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
                  <div
                    className={`w-full rounded-t transition-all duration-500 ${
                      isCurrent ? "bg-accent-warm" : "bg-white/20"
                    }`}
                    style={{
                      height: value !== null && value > 0
                        ? `${Math.max(4, (value / maxValue) * 60)}px`
                        : "3px",
                      opacity: value === null || value === 0 ? 0.3 : 1,
                    }}
                  />
                </div>
                <span className={`text-[9px] tabular-nums ${isCurrent ? "text-accent-warm font-bold" : "text-text-dim"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Monthly table */}
          <div className="space-y-1">
            {values.map(({ label, value, isCurrent, isPast }) => {
              const missing = isPast && (value === null || value === 0);
              return (
                <div
                  key={label}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                    isCurrent ? "bg-accent-warm/10" : missing ? "bg-accent-red/5" : "bg-bg-elevated"
                  }`}
                >
                  <span className={isCurrent ? "text-accent-warm font-semibold" : missing ? "text-text-dim" : "text-text-secondary"}>
                    {label}
                  </span>
                  <span className={`font-semibold tabular-nums ${
                    isCurrent ? "text-accent-warm" : missing ? "text-accent-red/60" : ""
                  }`}>
                    {value !== null && value > 0 ? `${value.toFixed(0)} kr`
                      : isCurrent ? "Pågår"
                      : missing ? "Ikke lagret"
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
