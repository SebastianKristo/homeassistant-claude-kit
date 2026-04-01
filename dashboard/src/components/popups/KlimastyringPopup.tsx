import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import { BottomSheet } from "./BottomSheet";

const KLIMASTYRING_MASTER    = "input_boolean.klimastyring_master_toggle";
const HELGEMODUS             = "input_boolean.helgemodus";
const HELGEMODUS_MANUELL     = "input_boolean.helgemodus_manuell";
const SOMMERMODUS            = "input_boolean.sommermodus";
const SOMMERMODUS_MANUELL    = "input_boolean.sommermodus_manuell";
const NATTMODUS_AKTIV        = "input_boolean.sebastian_nattmodus_aktiv";
const SEBASTIAN_MANUAL       = "input_boolean.sebastian_manual_mode";
const KLIMASTYRING_HELG_MAN  = "input_boolean.klimastyring_helg_manuell";
const CLIMATE_MODE           = "input_select.climate_mode";
const KOMFORTTEMP            = "input_number.komforttemp";
const HELGEMODUS_TEMP        = "input_number.helgemodus_temperature";
const SOMMERMODUS_TEMP       = "input_number.sommermodus_temperature";
const SEBASTIAN_NATTEMP      = "input_number.sebastian_natt_temp";
const LEGGETID               = "input_datetime.sebastian_leggetid";
const OPPSTIGINGSTID         = "input_datetime.sebastian_oppstigingstid";
const FASTLEDD_MARGIN        = "sensor.fastledd_margin_klimastyring_claude";

interface KlimastyringPopupProps {
  open: boolean;
  onClose: () => void;
}

function StatusRow({ label, value, color = "text-text-primary" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function BooleanRow({
  label, icon, entityId, entities, connection, activeColor = "text-accent-green",
}: {
  label: string; icon: string; entityId: string;
  entities: HassEntities; connection: Connection | null;
  activeColor?: string;
}) {
  const isOn = entities[entityId]?.state === "on";
  const toggle = () => {
    if (!connection) return;
    callService(connection, "input_boolean", isOn ? "turn_off" : "turn_on", undefined, { entity_id: entityId });
  };
  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-xl bg-bg-elevated px-3 py-2.5 transition-colors hover:bg-white/8 active:bg-white/8"
    >
      <div className="flex items-center gap-2">
        <Icon icon={icon} width={15} className={isOn ? activeColor : "text-text-dim"} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <div className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${isOn ? "bg-accent-green" : "bg-white/15"}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
    </button>
  );
}

export function KlimastyringPopup({ open, onClose }: KlimastyringPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  const klimaMasterOn  = entities[KLIMASTYRING_MASTER]?.state === "on";
  const currentMode    = entities[CLIMATE_MODE]?.state ?? "—";
  const helgemodusOn   = entities[HELGEMODUS]?.state === "on";
  const sommermodusOn  = entities[SOMMERMODUS]?.state === "on";
  const nattmodusAktiv = entities[NATTMODUS_AKTIV]?.state === "on";
  const sebastianMan   = entities[SEBASTIAN_MANUAL]?.state === "on";
  const helgManuell    = entities[KLIMASTYRING_HELG_MAN]?.state === "on";
  const helgManuellSt  = entities[HELGEMODUS_MANUELL]?.state === "on";
  const sommerManuell  = entities[SOMMERMODUS_MANUELL]?.state === "on";

  const komforttemp   = parseNumericState(entities[KOMFORTTEMP]?.state);
  const helgtemp      = parseNumericState(entities[HELGEMODUS_TEMP]?.state);
  const sommertemp    = parseNumericState(entities[SOMMERMODUS_TEMP]?.state);
  const sebastianNatt = parseNumericState(entities[SEBASTIAN_NATTEMP]?.state);
  const fastleddMargin = parseNumericState(entities[FASTLEDD_MARGIN]?.state);

  const leggetid        = entities[LEGGETID]?.state?.slice(0, 5) ?? "—";
  const oppstigingstid  = entities[OPPSTIGINGSTID]?.state?.slice(0, 5) ?? "—";

  const toggleMaster = () => {
    if (!connection) return;
    callService(connection, "input_boolean", klimaMasterOn ? "turn_off" : "turn_on", undefined, { entity_id: KLIMASTYRING_MASTER });
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Klimastyring</Dialog.Title>
      <Dialog.Description className="sr-only">Oversikt over klimastyrings-automasjoner</Dialog.Description>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
        {/* Master toggle */}
        <button
          onClick={toggleMaster}
          className={`flex w-full items-center justify-between rounded-2xl p-4 transition-colors ${
            klimaMasterOn ? "bg-accent-cool/12 ring-1 ring-accent-cool/30" : "bg-bg-card hover:bg-bg-elevated"
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon icon="mdi:home-thermometer" width={22} className={klimaMasterOn ? "text-accent-cool" : "text-text-dim"} />
            <div className="text-left">
              <div className="text-sm font-semibold">Klimastyring</div>
              <div className={`text-xs mt-0.5 ${klimaMasterOn ? "text-accent-cool" : "text-text-dim"}`}>
                {klimaMasterOn ? "Automatisk styring aktiv" : "Deaktivert"}
              </div>
            </div>
          </div>
          <div className={`h-6 w-11 rounded-full p-0.5 transition-colors ${klimaMasterOn ? "bg-accent-cool" : "bg-white/10"}`}>
            <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${klimaMasterOn ? "translate-x-5" : "translate-x-0"}`} />
          </div>
        </button>

        {/* Current state summary */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-text-dim uppercase tracking-wide">Nåværende tilstand</div>
          <div className="space-y-1.5">
            <StatusRow label="Klimamodus" value={currentMode} color="text-accent-cool" />
            {komforttemp !== null && <StatusRow label="Komforttemp" value={`${komforttemp.toFixed(1)}°`} />}
            {helgtemp !== null && helgemodusOn && <StatusRow label="Helgtemp" value={`${helgtemp.toFixed(1)}°`} color="text-accent-green" />}
            {sommertemp !== null && sommermodusOn && <StatusRow label="Sommertemp" value={`${sommertemp.toFixed(1)}°`} color="text-accent-warm" />}
            {sebastianNatt !== null && <StatusRow label="Natt (Sebastian)" value={`${sebastianNatt.toFixed(1)}°`} color="text-accent-cool" />}
            {fastleddMargin !== null && (
              <StatusRow
                label="Effektledd-margin"
                value={`${fastleddMargin.toFixed(2)} kW`}
                color={fastleddMargin < 0.5 ? "text-accent-red" : fastleddMargin < 1.5 ? "text-accent-warm" : "text-accent-green"}
              />
            )}
          </div>
        </div>

        {/* Automations toggles */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-text-dim uppercase tracking-wide">Automasjoner</div>
          <div className="space-y-1.5">
            <BooleanRow label="Helgemodus" icon="mdi:sofa" entityId={HELGEMODUS} entities={entities} connection={connection} activeColor="text-accent-green" />
            <BooleanRow label="Helgemodus manuell" icon="mdi:hand-pointing-right" entityId={HELGEMODUS_MANUELL} entities={entities} connection={connection} activeColor="text-accent-green" />
            <BooleanRow label="Sommermodus" icon="mdi:weather-sunny" entityId={SOMMERMODUS} entities={entities} connection={connection} activeColor="text-accent-warm" />
            <BooleanRow label="Sommermodus manuell" icon="mdi:hand-pointing-right" entityId={SOMMERMODUS_MANUELL} entities={entities} connection={connection} activeColor="text-accent-warm" />
            <BooleanRow label="Nattmodus aktiv" icon="mdi:weather-night" entityId={NATTMODUS_AKTIV} entities={entities} connection={connection} activeColor="text-accent-cool" />
            <BooleanRow label="Sebastian manuell" icon="mdi:account-cog" entityId={SEBASTIAN_MANUAL} entities={entities} connection={connection} activeColor="text-accent-warm" />
            <BooleanRow label="Helg-manuell (klimastyring)" icon="mdi:calendar-weekend" entityId={KLIMASTYRING_HELG_MAN} entities={entities} connection={connection} activeColor="text-accent-green" />
          </div>
        </div>

        {/* Active badges */}
        {(helgemodusOn || sommermodusOn || nattmodusAktiv || sebastianMan || helgManuell || helgManuellSt || sommerManuell) && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-text-dim uppercase tracking-wide">Aktive overstyringer</div>
            <div className="flex flex-wrap gap-2">
              {nattmodusAktiv && (
                <span className="flex items-center gap-1 rounded-full bg-accent-cool/15 px-2.5 py-1 text-xs font-medium text-accent-cool">
                  <Icon icon="mdi:weather-night" width={12} /> Nattmodus
                </span>
              )}
              {helgemodusOn && (
                <span className="flex items-center gap-1 rounded-full bg-accent-green/15 px-2.5 py-1 text-xs font-medium text-accent-green">
                  <Icon icon="mdi:sofa" width={12} /> Helgemodus
                </span>
              )}
              {sommermodusOn && (
                <span className="flex items-center gap-1 rounded-full bg-accent-warm/15 px-2.5 py-1 text-xs font-medium text-accent-warm">
                  <Icon icon="mdi:weather-sunny" width={12} /> Sommermodus
                </span>
              )}
              {sebastianMan && (
                <span className="flex items-center gap-1 rounded-full bg-accent-warm/15 px-2.5 py-1 text-xs font-medium text-accent-warm">
                  <Icon icon="mdi:account-cog" width={12} /> Sebastian manuell
                </span>
              )}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-text-dim uppercase tracking-wide">Tidsplan</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-bg-card px-3 py-2.5 text-center">
              <div className="text-xs text-text-dim mb-0.5">Leggetid</div>
              <div className="text-base font-semibold tabular-nums">{leggetid}</div>
            </div>
            <div className="rounded-xl bg-bg-card px-3 py-2.5 text-center">
              <div className="text-xs text-text-dim mb-0.5">Oppstigingstid</div>
              <div className="text-base font-semibold tabular-nums">{oppstigingstid}</div>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
