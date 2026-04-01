import { useState, useEffect, useCallback, useRef } from "react";
import { useHass } from "@hakit/core";
import type { Connection } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { BottomSheet } from "../popups/BottomSheet";
import { DialogTitle, DialogDescription } from "@radix-ui/react-dialog";

interface FrigateEvent {
  id: string;
  camera: string;
  label: string;
  score: number;
  start_time: number;
  end_time: number | null;
  has_clip: boolean;
  has_snapshot: boolean;
  top_score: number;
  zones: string[];
}

// MQTT client_id from Frigate config — used as instance_id in WS API
const FRIGATE_INSTANCE_ID = "frigate";

const LABEL_ICONS: Record<string, string> = {
  person: "mdi:account",
  car:    "mdi:car",
  cat:    "mdi:cat",
  dog:    "mdi:dog",
  package:"mdi:package-variant",
};
const LABEL_NO: Record<string, string> = {
  person: "Person", car: "Bil", cat: "Katt", dog: "Hund", package: "Pakke",
};

const PAGE = 12;

type DateOpt = "today" | "yesterday" | "week" | "all";
const DATE_OPTS: { id: DateOpt; label: string }[] = [
  { id: "today",     label: "I dag" },
  { id: "yesterday", label: "I går" },
  { id: "week",      label: "Uke" },
  { id: "all",       label: "Alt" },
];

// All media served via HA proxy — same-origin, no CORS issues
function thumbSrc(eventId: string): string {
  return `/api/frigate/notifications/${eventId}/thumbnail.jpg`;
}
function clipSrc(eventId: string): string {
  return `/api/frigate/notifications/${eventId}/clip.mp4`;
}

async function fetchEvents(
  connection: Connection,
  opts: {
    camera: string;
    label: string;
    date: DateOpt;
    before?: number; // unix seconds — for pagination
  },
): Promise<FrigateEvent[]> {
  const msg: Record<string, unknown> = {
    type: "frigate/events/get",
    instance_id: FRIGATE_INSTANCE_ID,
    limit: PAGE,
  };

  if (opts.camera !== "all") msg["cameras"] = [opts.camera];
  if (opts.label  !== "all") msg["labels"]  = [opts.label];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (opts.date === "today")     msg["after"]  = Math.floor(today.getTime() / 1000);
  if (opts.date === "yesterday") {
    msg["after"]  = Math.floor((today.getTime() - 86_400_000) / 1000);
    msg["before"] = Math.floor(today.getTime() / 1000);
  }
  if (opts.date === "week") msg["after"] = Math.floor((today.getTime() - 7 * 86_400_000) / 1000);
  if (opts.before !== undefined) {
    const existing = msg["before"] as number | undefined;
    msg["before"] = existing !== undefined ? Math.min(existing, opts.before) : opts.before;
  }

  const raw = await connection.sendMessagePromise<FrigateEvent[] | string>(
    msg as Parameters<Connection["sendMessagePromise"]>[0],
  );
  // Integration may return a JSON string (decode_json=False) or array directly
  const data: FrigateEvent[] = typeof raw === "string" ? (JSON.parse(raw) as FrigateEvent[]) : raw;
  return Array.isArray(data) ? data : [];
}

function relTime(unixSec: number): string {
  const m = Math.floor((Date.now() - unixSec * 1000) / 60_000);
  if (m < 1)  return "Akkurat nå";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t`;
  return `${Math.floor(h / 24)} d`;
}

// ── Video popup ─────────────────────────────────────────────────────────────

function ClipPopup({
  event, open, onClose,
}: {
  event: FrigateEvent | null; open: boolean; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!open) videoRef.current?.pause();
  }, [open]);

  const clipUrl  = event?.has_clip     ? clipSrc(event.id)  : null;
  const thumbUrl = event?.has_snapshot ? thumbSrc(event.id) : null;

  return (
    <BottomSheet open={open && !!event} onClose={onClose} className="flex flex-col overflow-hidden md:max-w-lg">
      {event && (
        <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
          <DialogTitle className="text-sm font-semibold">
            {LABEL_NO[event.label] ?? event.label} · {event.camera.replace(/_/g, " ")}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-text-dim -mt-2">
            {new Date(event.start_time * 1000).toLocaleString("no-NO")}
            {event.top_score > 0 && ` · ${Math.round(event.top_score * 100)}%`}
          </DialogDescription>

          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
            {clipUrl ? (
              <video
                ref={videoRef}
                src={clipUrl}
                controls
                playsInline
                autoPlay
                className="h-full w-full object-contain"
                poster={thumbUrl ?? undefined}
              />
            ) : thumbUrl ? (
              <img src={thumbUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Icon icon="mdi:video-off-outline" width={32} className="text-white/30" />
              </div>
            )}
          </div>

          {event.zones.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {event.zones.map((z) => (
                <span key={z} className="text-[10px] bg-white/8 text-text-dim rounded-full px-2 py-0.5">
                  {z.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// ── Filter pill row ──────────────────────────────────────────────────────────

function PillRow<T extends string>({
  options, selected, onSelect,
}: {
  options: { id: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selected === o.id
              ? "bg-accent/20 text-accent"
              : "bg-white/6 text-text-dim hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Main card ────────────────────────────────────────────────────────────────

export function FrigateHistoryCard() {
  const connection = useHass((s) => s.connection) as Connection | null;

  const [dateFilter,   setDateFilter]   = useState<DateOpt>("today");
  const [cameraFilter, setCameraFilter] = useState("all");
  const [labelFilter,  setLabelFilter]  = useState("all");
  const [events,       setEvents]       = useState<FrigateEvent[]>([]);
  const [hasMore,      setHasMore]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [error,        setError]        = useState(false);
  const [selected,     setSelected]     = useState<FrigateEvent | null>(null);

  const [cameras, setCameras] = useState<string[]>([]);
  const [labels,  setLabels]  = useState<string[]>([]);

  const load = useCallback(async (beforeTs: number | undefined, replace: boolean) => {
    if (!connection) return;
    try {
      const data = await fetchEvents(connection, {
        camera: cameraFilter, label: labelFilter, date: dateFilter, before: beforeTs,
      });
      setEvents((prev) => replace ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE);
      setError(false);

      if (cameraFilter === "all" && labelFilter === "all") {
        setCameras((prev) => Array.from(new Set([...prev, ...data.map((e) => e.camera)])).sort());
        setLabels((prev) => Array.from(new Set([...prev, ...data.map((e) => e.label)])).sort());
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [connection, cameraFilter, labelFilter, dateFilter]);

  useEffect(() => {
    setLoading(true);
    setEvents([]);
    load(undefined, true);
  }, [load]);

  const loadMore = () => {
    if (events.length === 0) return;
    setLoadingMore(true);
    // Paginate using the oldest event's start_time as the upper bound
    const oldest = events[events.length - 1].start_time;
    load(oldest, false);
  };

  const cameraOpts = [
    { id: "all", label: "Alle" },
    ...cameras.map((c) => ({ id: c, label: c.replace(/_/g, " ") })),
  ];
  const labelOpts = [
    { id: "all", label: "Alle" },
    ...labels.map((l) => ({ id: l, label: LABEL_NO[l] ?? l })),
  ];

  return (
    <div className="rounded-2xl bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:shield-search" width={16} className="text-accent" />
          <span className="text-sm font-semibold">Frigate-hendelser</span>
        </div>
        <button
          onClick={() => { setLoading(true); load(undefined, true); }}
          className="p-1 text-text-dim hover:text-text-secondary transition-colors"
          aria-label="Oppdater"
        >
          <Icon icon="mdi:refresh" width={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-2 px-4 pb-3">
        <PillRow options={DATE_OPTS}   selected={dateFilter}   onSelect={(v) => { setDateFilter(v);   setCameraFilter("all"); setLabelFilter("all"); }} />
        {cameraOpts.length > 2 && <PillRow options={cameraOpts} selected={cameraFilter} onSelect={setCameraFilter} />}
        {labelOpts.length  > 2 && <PillRow options={labelOpts}  selected={labelFilter}  onSelect={setLabelFilter} />}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-dim">
          <Icon icon="mdi:loading" width={16} className="animate-spin" />
          Laster…
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-1 px-4 py-6 text-sm">
          <div className="flex items-center gap-2 text-text-dim">
            <Icon icon="mdi:video-off-outline" width={16} />
            Frigate ikke tilgjengelig
          </div>
          <div className="text-xs text-text-dim/60 pl-6">
            Sjekk at Frigate-integrasjonen er lastet inn i HA.
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-dim">
          <Icon icon="mdi:shield-check-outline" width={16} className="text-accent-green" />
          Ingen hendelser i dette tidsrommet
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-white/5 border-t border-white/5">
            {events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setSelected(ev)}
                className="relative aspect-video bg-black/60 overflow-hidden group hover:brightness-110 transition-all"
              >
                {ev.has_snapshot && (
                  <img
                    src={thumbSrc(ev.id)}
                    alt={ev.label}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                {ev.has_clip && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                      <Icon icon="mdi:play" width={18} className="text-white" />
                    </div>
                  </div>
                )}
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                  <Icon icon={LABEL_ICONS[ev.label] ?? "mdi:alert-circle-outline"} width={10} className="text-accent" />
                  <span className="text-[9px] font-medium text-white">{LABEL_NO[ev.label] ?? ev.label}</span>
                </div>
                <div className="absolute bottom-1 right-1.5 text-[9px] font-medium text-white/80 tabular-nums drop-shadow">
                  {relTime(ev.start_time)}
                </div>
              </button>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-1.5 py-3 text-xs text-text-dim hover:text-text-secondary transition-colors border-t border-white/5"
            >
              {loadingMore ? <Icon icon="mdi:loading" width={13} className="animate-spin" /> : <Icon icon="mdi:chevron-down" width={13} />}
              Last inn flere
            </button>
          )}
        </>
      )}

      <ClipPopup event={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </div>
  );
}
