import { useState, useEffect } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState } from "../../lib/format";

// ── Types ──────────────────────────────────────────────────────────────────

interface FuelPrice {
  fuelTypeId: number;
  price: number;
  deleted: boolean;
  updatedAt?: string;
}

interface Station {
  id: number;
  name: string;
  latitude?: string | number;
  longitude?: string | number;
  coordinates?: { latitude: number; longitude: number };
  brand: { name: string; imageUrl?: string };
  prices: FuelPrice[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const FUEL_PETROL  = 2; // Bensin 95
const FUEL_DIESEL  = 1; // Diesel
const MAX_STATIONS = 12;
const MAX_RADIUS_KM = 30;

type ZoneId = "home" | "toten" | "stromstad" | "me";

const ZONES: { id: ZoneId; label: string; entity: string }[] = [
  { id: "me",        label: "Meg",       entity: "" },
  { id: "home",      label: "Oslo",      entity: "zone.home" },
  { id: "toten",     label: "Toten",     entity: "zone.toten" },
  { id: "stromstad", label: "Strømstad", entity: "zone.stromstad" },
];

// ── Station coordinate helpers ─────────────────────────────────────────────

function stationLat(s: Station): number {
  if (s.coordinates?.latitude != null) return s.coordinates.latitude;
  return Number(s.latitude ?? NaN);
}

function stationLon(s: Station): number {
  if (s.coordinates?.longitude != null) return s.coordinates.longitude;
  return Number(s.longitude ?? NaN);
}

// ── Haversine distance ─────────────────────────────────────────────────────

function haversinKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPrice(station: Station, fuelTypeId: number): number | null {
  const p = station.prices?.find((f) => f.fuelTypeId === fuelTypeId && !f.deleted);
  return p ? p.price : null;
}

function formatPrice(p: number | null): string {
  if (p === null) return "—";
  return p.toFixed(2);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StationRow({
  station,
  distKm,
  sortFuel,
}: {
  station: Station;
  distKm: number;
  sortFuel: number;
}) {
  const petrol = getPrice(station, FUEL_PETROL);
  const diesel = getPrice(station, FUEL_DIESEL);
  const primary = sortFuel === FUEL_PETROL ? petrol : diesel;
  const secondary = sortFuel === FUEL_PETROL ? diesel : petrol;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{station.brand?.name ?? "—"}</div>
        <div className="text-[11px] text-text-dim truncate">{station.name} · {distKm.toFixed(1)} km</div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-right">
        <div>
          <div className="text-[10px] text-text-dim">{sortFuel === FUEL_PETROL ? "Bensin" : "Diesel"}</div>
          <div className={`text-sm font-bold tabular-nums ${primary !== null ? "text-text-primary" : "text-text-dim"}`}>
            {formatPrice(primary)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-dim">{sortFuel === FUEL_PETROL ? "Diesel" : "Bensin"}</div>
          <div className="text-sm tabular-nums text-text-secondary">
            {formatPrice(secondary)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main popup ─────────────────────────────────────────────────────────────

interface GasPricePopupProps {
  open: boolean;
  onClose: () => void;
}

export function GasPricePopup({ open, onClose }: GasPricePopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [selectedZone, setSelectedZone] = useState<ZoneId>("me");
  const [sortFuel, setSortFuel] = useState<number>(FUEL_PETROL);
  const [myPos, setMyPos] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Request geolocation when "Meg" tab is active and popup is open
  useEffect(() => {
    if (!open || selectedZone !== "me") return;
    if (myPos) return; // already have it
    if (!navigator.geolocation) { setGeoError("GPS ikke tilgjengelig i denne nettleseren"); return; }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMyPos({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setGeoLoading(false); },
      () => { setGeoError("Kunne ikke hente posisjon. Sjekk at nettleseren har tilgang til posisjon."); setGeoLoading(false); },
      { timeout: 10000, maximumAge: 60000 },
    );
  }, [open, selectedZone, myPos]);

  const stationsRaw = (entities["sensor.gas_prices"]?.attributes as Record<string, unknown> | undefined)?.stations as Station[] | undefined;

  const zone = ZONES.find((z) => z.id === selectedZone)!;
  const zoneEntity = zone.entity ? entities[zone.entity] : undefined;
  const zoneLat: number | undefined = selectedZone === "me" ? myPos?.lat : zoneEntity?.attributes?.latitude as number | undefined;
  const zoneLon: number | undefined = selectedZone === "me" ? myPos?.lon : zoneEntity?.attributes?.longitude as number | undefined;

  let nearbyStations: (Station & { distKm: number })[] = [];

  if (stationsRaw && zoneLat !== undefined && zoneLon !== undefined) {
    nearbyStations = stationsRaw
      .map((s) => ({ ...s, distKm: haversinKm(zoneLat, zoneLon, stationLat(s), stationLon(s)) }))
      .filter((s) => s.distKm <= MAX_RADIUS_KM && getPrice(s, sortFuel) !== null)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, MAX_STATIONS);
  }

  const cheapestPetrol = nearbyStations.find((s) => getPrice(s, FUEL_PETROL) !== null);
  const cheapestDiesel = nearbyStations.find((s) => getPrice(s, FUEL_DIESEL) !== null);

  const noZoneData = selectedZone === "me"
    ? !geoLoading && !geoError && myPos === null
    : zoneLat === undefined;
  const noStations = !noZoneData && !geoLoading && nearbyStations.length === 0;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Drivstoffpriser</Dialog.Title>
      <Dialog.Description className="sr-only">Bensin- og dieselpriser på nærliggende stasjoner</Dialog.Description>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:gas-station" width={20} className="text-accent-warm" />
            <h2 className="text-base font-semibold">Drivstoffpriser</h2>
          </div>
          <span className="text-[10px] text-text-dim">drivstoffappen.no</span>
        </div>

        {/* Best prices summary */}
        {(cheapestPetrol || cheapestDiesel) && (
          <div className="grid grid-cols-2 gap-3">
            {cheapestPetrol && (
              <div className="rounded-2xl bg-bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Icon icon="mdi:gas-station" width={14} className="text-accent-green" />
                  <span className="text-xs text-text-dim">Billigste bensin</span>
                </div>
                <div className="text-2xl font-bold tabular-nums text-accent-green">
                  {formatPrice(getPrice(cheapestPetrol, FUEL_PETROL))}
                </div>
                <div className="text-[10px] text-text-dim mt-0.5 truncate">
                  {cheapestPetrol.brand?.name} · {cheapestPetrol.distKm.toFixed(1)} km
                </div>
              </div>
            )}
            {cheapestDiesel && (
              <div className="rounded-2xl bg-bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Icon icon="mdi:fuel" width={14} className="text-accent-cool" />
                  <span className="text-xs text-text-dim">Billigste diesel</span>
                </div>
                <div className="text-2xl font-bold tabular-nums text-accent-cool">
                  {formatPrice(getPrice(cheapestDiesel, FUEL_DIESEL))}
                </div>
                <div className="text-[10px] text-text-dim mt-0.5 truncate">
                  {cheapestDiesel.brand?.name} · {cheapestDiesel.distKm.toFixed(1)} km
                </div>
              </div>
            )}
          </div>
        )}

        {/* Zone selector */}
        <div className="flex gap-2">
          {ZONES.map((z) => (
            <button
              key={z.id}
              onClick={() => setSelectedZone(z.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                selectedZone === z.id
                  ? "bg-accent-warm/20 text-accent-warm"
                  : "bg-bg-elevated text-text-secondary hover:bg-white/10"
              }`}
            >
              {z.id === "me" ? (
                <span className="flex items-center justify-center gap-1">
                  <Icon icon="mdi:crosshairs-gps" width={14} />
                  Meg
                </span>
              ) : z.label}
            </button>
          ))}
        </div>

        {/* Geolocation status */}
        {selectedZone === "me" && geoLoading && (
          <p className="text-xs text-text-dim text-center py-2 flex items-center justify-center gap-2">
            <Icon icon="mdi:loading" width={14} className="animate-spin" />
            Henter posisjon…
          </p>
        )}
        {selectedZone === "me" && geoError && (
          <p className="text-xs text-accent-red text-center py-2">{geoError}</p>
        )}

        {/* Fuel type sort toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setSortFuel(FUEL_PETROL)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
              sortFuel === FUEL_PETROL ? "bg-accent-green/15 text-accent-green" : "bg-bg-elevated text-text-dim"
            }`}
          >
            <Icon icon="mdi:gas-station" width={14} />
            Bensin 95
          </button>
          <button
            onClick={() => setSortFuel(FUEL_DIESEL)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
              sortFuel === FUEL_DIESEL ? "bg-accent-cool/15 text-accent-cool" : "bg-bg-elevated text-text-dim"
            }`}
          >
            <Icon icon="mdi:fuel" width={14} />
            Diesel
          </button>
          <span className="ml-auto text-[10px] text-text-dim self-center">
            nærmeste innen {MAX_RADIUS_KM} km
          </span>
        </div>

        {/* Station list */}
        {noZoneData && (
          <p className="text-xs text-text-dim text-center py-4">
            Sone «{zone.label}» mangler koordinater i Home Assistant.
          </p>
        )}
        {noStations && (
          <p className="text-xs text-text-dim text-center py-4">
            Ingen stasjoner funnet innen {MAX_RADIUS_KM} km fra {zone.label}.
          </p>
        )}
        {nearbyStations.length > 0 && (
          <div className="space-y-1.5">
            {nearbyStations.map((s) => (
              <StationRow key={s.id} station={s} distKm={s.distKm} sortFuel={sortFuel} />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ── Compact card for HomeView ──────────────────────────────────────────────

export function GasPriceCard({
  entities,
  onOpen,
}: {
  entities: HassEntities;
  onOpen: () => void;
}) {
  const stationsRaw = (entities["sensor.gas_prices"]?.attributes as Record<string, unknown> | undefined)?.stations as Station[] | undefined;
  const zoneEntity = entities["zone.home"];
  const zoneLat = zoneEntity?.attributes?.latitude as number | undefined;
  const zoneLon = zoneEntity?.attributes?.longitude as number | undefined;

  if (!stationsRaw || zoneLat === undefined) return null;

  const nearby = stationsRaw
    .map((s) => ({ ...s, distKm: haversinKm(zoneLat, zoneLon!, stationLat(s), stationLon(s)) }))
    .filter((s) => s.distKm <= MAX_RADIUS_KM);

  const cheapPetrol = nearby
    .map((s) => getPrice(s, FUEL_PETROL))
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)[0] ?? null;

  const cheapDiesel = nearby
    .map((s) => getPrice(s, FUEL_DIESEL))
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)[0] ?? null;

  if (cheapPetrol === null && cheapDiesel === null) return null;

  const lastUpdated = parseNumericState(entities["sensor.gas_prices"]?.state);
  void lastUpdated;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-bg-card px-4 py-3.5 text-left transition-colors hover:bg-bg-elevated active:bg-bg-elevated"
    >
      <Icon icon="mdi:gas-station" width={20} className="text-accent-warm shrink-0" />
      <div className="min-w-0 flex-1 flex items-center gap-4">
        {cheapPetrol !== null && (
          <div>
            <div className="text-[10px] text-text-dim">Bensin 95</div>
            <div className="text-sm font-semibold tabular-nums text-accent-green">{formatPrice(cheapPetrol)}</div>
          </div>
        )}
        {cheapDiesel !== null && (
          <div>
            <div className="text-[10px] text-text-dim">Diesel</div>
            <div className="text-sm font-semibold tabular-nums text-accent-cool">{formatPrice(cheapDiesel)}</div>
          </div>
        )}
        <span className="text-xs text-text-dim">Billigste nær deg</span>
      </div>
      <Icon icon="mdi:chevron-right" width={16} className="text-text-dim shrink-0" />
    </button>
  );
}
