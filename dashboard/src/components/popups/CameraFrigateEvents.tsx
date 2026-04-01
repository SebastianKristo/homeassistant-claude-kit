import { useState, useEffect, useRef } from "react";
import { useHass } from "@hakit/core";
import type { Connection } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { DialogTitle, DialogDescription } from "@radix-ui/react-dialog";

interface FrigateEvent {
  id: string;
  camera: string;
  label: string;
  top_score: number;
  start_time: number;
  end_time: number | null;
  has_clip: boolean;
  has_snapshot: boolean;
  zones: string[];
}

const FRIGATE_INSTANCE_ID = "frigate";
const PAGE = 12;

const LABEL_ICONS: Record<string, string> = {
  person: "mdi:account",
  car: "mdi:car",
  cat: "mdi:cat",
  dog: "mdi:dog",
  package: "mdi:package-variant",
};
const LABEL_NO: Record<string, string> = {
  person: "Person", car: "Bil", cat: "Katt", dog: "Hund", package: "Pakke",
};

function thumbSrc(id: string) { return `/api/frigate/notifications/${id}/thumbnail.jpg`; }
function clipSrc(id: string)  { return `/api/frigate/notifications/${id}/clip.mp4`; }

function relTime(unixSec: number): string {
  const m = Math.floor((Date.now() - unixSec * 1000) / 60_000);
  if (m < 1)  return "Akkurat nå";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t`;
  return `${Math.floor(h / 24)} d`;
}

async function fetchEvents(
  connection: Connection,
  camera: string,
  before?: number,
): Promise<FrigateEvent[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const msg: Record<string, unknown> = {
    type: "frigate/events/get",
    instance_id: FRIGATE_INSTANCE_ID,
    cameras: [camera],
    after: Math.floor(today.getTime() / 1000),
    limit: PAGE,
  };
  if (before !== undefined) msg["before"] = before;

  const raw = await connection.sendMessagePromise<FrigateEvent[] | string>(
    msg as Parameters<Connection["sendMessagePromise"]>[0],
  );
  const data: FrigateEvent[] = typeof raw === "string" ? (JSON.parse(raw) as FrigateEvent[]) : raw;
  return Array.isArray(data) ? data : [];
}

function ClipSheet({
  event, open, onClose,
}: { event: FrigateEvent | null; open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!open) videoRef.current?.pause(); }, [open]);

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

interface CameraFrigateEventsProps {
  frigateCamera: string;
}

export function CameraFrigateEvents({ frigateCamera }: CameraFrigateEventsProps) {
  const connection = useHass((s) => s.connection) as Connection | null;
  const [events, setEvents]         = useState<FrigateEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [hasMore, setHasMore]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState(false);
  const [selected, setSelected]     = useState<FrigateEvent | null>(null);

  useEffect(() => {
    if (!connection) return;
    setLoading(true);
    setEvents([]);
    fetchEvents(connection, frigateCamera)
      .then((data) => {
        setEvents(data);
        setHasMore(data.length === PAGE);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [connection, frigateCamera]);

  const loadMore = () => {
    if (!connection || events.length === 0) return;
    setLoadingMore(true);
    const oldest = events[events.length - 1].start_time;
    fetchEvents(connection, frigateCamera, oldest)
      .then((data) => {
        setEvents((prev) => [...prev, ...data]);
        setHasMore(data.length === PAGE);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  if (error || (!loading && events.length === 0)) return null;

  return (
    <div className="border-t border-white/5 pt-3">
      <div className="flex items-center gap-2 pb-2">
        <Icon icon="mdi:shield-search" width={13} className="text-accent" />
        <span className="text-xs font-semibold">Frigate i dag</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-dim">
          <Icon icon="mdi:loading" width={14} className="animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px bg-white/5 rounded-xl overflow-hidden">
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
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60">
                      <Icon icon="mdi:play" width={14} className="text-white" />
                    </div>
                  </div>
                )}
                <div className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1 py-0.5">
                  <Icon icon={LABEL_ICONS[ev.label] ?? "mdi:alert-circle-outline"} width={8} className="text-accent" />
                  <span className="text-[8px] font-medium text-white">{LABEL_NO[ev.label] ?? ev.label}</span>
                </div>
                <div className="absolute bottom-0.5 right-1 text-[8px] font-medium text-white/80 tabular-nums drop-shadow">
                  {relTime(ev.start_time)}
                </div>
              </button>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-1 pt-2 text-xs text-text-dim hover:text-text-secondary transition-colors"
            >
              {loadingMore
                ? <Icon icon="mdi:loading" width={12} className="animate-spin" />
                : <Icon icon="mdi:chevron-down" width={12} />}
              Last inn flere
            </button>
          )}
        </>
      )}

      <ClipSheet event={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </div>
  );
}
