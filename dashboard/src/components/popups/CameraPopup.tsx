import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { DialogTitle, DialogDescription } from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import type { CameraConfig } from "../../lib/entities";
import { parseNumericState, formatRelativeTime } from "../../lib/format";
import { buildImageUrl } from "../../lib/camera-utils";
import {
  authHeaders,
  callServiceRest,
  fireServiceRest,
  triggerSnapshot,
  pendingStopTimers,
  startingStreams,
} from "./camera-services";
import { CameraStats } from "./CameraStats";
import { CameraFrigateEvents } from "./CameraFrigateEvents";
import { Go2RtcPlayer } from "../Go2RtcPlayer";
import { SnapshotHistory, DateNavigator } from "../cards/SnapshotHistory";
import { BottomSheet } from "./BottomSheet";

interface CameraPopupProps {
  camera: CameraConfig | null;
  open: boolean;
  onClose: () => void;
  onSnapshot?: (cameraId: string) => void;
  gateLockEntity?: string;
}

export function CameraPopup({ camera, open, onClose, onSnapshot, gateLockEntity }: CameraPopupProps) {
  return (
    <BottomSheet open={open && !!camera} onClose={onClose} className="flex flex-col overflow-hidden md:max-w-lg">
      {camera && <CameraContent camera={camera} onSnapshot={onSnapshot} gateLockEntity={gateLockEntity} />}
    </BottomSheet>
  );
}

function CameraContent({ camera, onSnapshot, gateLockEntity }: { camera: CameraConfig; onSnapshot?: (cameraId: string) => void; gateLockEntity?: string }) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection);
  const [imgError, setImgError] = useState(false);
  // Proxy mode: cameras without go2rtcStream use HA's camera_proxy (auto-refresh JPEG)
  const isProxyCamera = !camera.go2rtcStream;
  // alwaysStreaming or proxy cameras are immediately ready — no P2P start needed
  const [isStreaming, setIsStreaming] = useState(() => !!camera.alwaysStreaming || isProxyCamera);
  const [isPlaying, setIsPlaying] = useState(false);
  // Signed URL for proxy cameras (HA requires auth — img tags can't send Bearer headers)
  const [signedProxyUrl, setSignedProxyUrl] = useState<string | null>(null);
  // Auto-refresh timestamp to bust browser cache on each signed URL
  const [proxyTs, setProxyTs] = useState(Date.now);
  const [viewingSnapshot, setViewingSnapshot] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [snapshotRefreshKey, setSnapshotRefreshKey] = useState(0);
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);

  const battery = parseNumericState(entities[camera.batterySensor]?.state);
  const wifi = parseNumericState(entities[camera.wifiSensor]?.state);
  const charging = entities[camera.chargingSensor]?.state;
  const cameraState = entities[camera.entity]?.state;

  // Proxy cameras: use entity_picture which includes a long-lived access token.
  // Refresh the timestamp every 2 s to bust browser cache and get latest frame.
  useEffect(() => {
    if (!isProxyCamera) return;
    const entityPicture = entities[camera.entity]?.attributes?.entity_picture as string | undefined;
    if (entityPicture) {
      setSignedProxyUrl(entityPicture);
    }
  }, [isProxyCamera, entities, camera.entity]);

  useEffect(() => {
    if (!isProxyCamera) return;
    const tsInterval = setInterval(() => setProxyTs(Date.now()), 2000);
    return () => clearInterval(tsInterval);
  }, [isProxyCamera]);

  // For P2P battery cameras: watch entity state and start stream via service.
  // alwaysStreaming and proxy cameras skip this entirely.
  useEffect(() => {
    if (camera.alwaysStreaming || isProxyCamera) return;
    if (!isStreaming && cameraState === "streaming") {
      setIsStreaming(true);
    }
  }, [camera.alwaysStreaming, isProxyCamera, cameraState, isStreaming]);

  useEffect(() => {
    if (camera.alwaysStreaming || isProxyCamera) return;

    // Cancel any pending stop from a previous popup instance for this camera
    const existingTimer = pendingStopTimers.get(camera.entity);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingStopTimers.delete(camera.entity);
    }

    // Check current state — if already streaming, just connect
    if (cameraState === "streaming") {
      setIsStreaming(true);
      return;
    }

    // Guard against React strict mode double-invoking this effect.
    const lastStart = startingStreams.get(camera.entity) ?? 0;
    if (Date.now() - lastStart < 10_000) {
      return;
    }
    startingStreams.set(camera.entity, Date.now());

    let cancelled = false;
    (async () => {
      const ok = await callServiceRest("script", "camera_switch_stream", {
        camera_entity: camera.entity,
      });
      if (!ok && !cancelled) {
        await callServiceRest("eufy_security", "start_p2p_livestream", {
          entity_id: camera.entity,
        });
      }
    })();

    return () => {
      cancelled = true;
      const entity = camera.entity;
      const timer = setTimeout(() => {
        pendingStopTimers.delete(entity);
        fetch(`/api/states/${entity}`, { headers: authHeaders() })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.state === "streaming") {
              fireServiceRest("eufy_security", "stop_p2p_livestream", {
                entity_id: entity,
              });
            }
          })
          .catch(() => {});
      }, 2000);
      pendingStopTimers.set(entity, timer);
    };
  }, [camera.alwaysStreaming, camera.entity]);

  // Save snapshot once video frames are flowing (once per popup open).
  // Skips if a snapshot was saved within the last 15 minutes.
  // Delegates to copy_stream_snapshot.py which grabs a frame from go2rtc,
  // verifies it's non-empty, then saves to /media/ (history) and /config/www/ (latest).
  // onSnapshot stored in ref to keep it out of deps -- parent re-renders create new
  // function refs constantly (HA WebSocket updates), which would clear the timer.
  const onSnapshotRef = useRef(onSnapshot);
  useLayoutEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => {
    if (!isPlaying) return;
    let cancelled = false;

    const checkAndSave = async () => {
      // Check if a recent snapshot exists (< 15 min) -- skip if so
      try {
        const res = await fetch(`/local/snapshots/${camera.id}.jpg`, {
          method: "HEAD",
          headers: authHeaders(),
        });
        if (res.ok) {
          const lastMod = res.headers.get("Last-Modified");
          if (lastMod) {
            const ageMs = Date.now() - new Date(lastMod).getTime();
            if (ageMs < 15 * 60 * 1000) return; // fresh enough
          }
        }
      } catch { /* proceed to save */ }
      if (cancelled) return;

      triggerSnapshot(camera.id, cancelled, () => {
        if (!cancelled) {
          setSnapshotRefreshKey((k) => k + 1);
          onSnapshotRef.current?.(camera.id);
        }
      }, camera.entity);
    };

    // Wait for the stream to stabilize before checking/saving
    const timer = setTimeout(checkAndSave, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isPlaying, camera.id]);

  // Manual snapshot button handler
  const takeManualSnapshot = () => {
    if (isTakingSnapshot || !isStreaming) return;
    setIsTakingSnapshot(true);
    triggerSnapshot(camera.id, false, () => {
      setSnapshotRefreshKey((k) => k + 1);
      onSnapshotRef.current?.(camera.id);
      setIsTakingSnapshot(false);
    }, camera.entity);
  };

  // Last person detection from HA history (person sensor last "on" state)
  const personIsOn = entities[camera.personSensor]?.state === "on";
  const personLastChanged = entities[camera.personSensor]?.last_changed;
  const lastPersonTime = personIsOn
    ? "Just now"
    : personLastChanged
      ? formatRelativeTime(personLastChanged)
      : null;

  // Prefer saved snapshot, fall back to event image
  // Use a per-mount timestamp so each popup open busts the browser cache
  const [mountTime] = useState(() => Date.now());
  const imageEntity = entities[camera.eventImage];
  const snapshotUrl = `/local/snapshots/${camera.id}.jpg?_t=${mountTime}`;
  const eventImageUrl = buildImageUrl(imageEntity);
  const imageUrl = !imgError ? snapshotUrl : eventImageUrl;
  const showImage = !!imageUrl;

  const unlockGate = () => {
    if (!connection || !gateLockEntity) return;
    callService(connection, "switch", "turn_on", undefined, {
      entity_id: gateLockEntity,
    });
  };

  return (
    <>
      {/* Fixed top: preview + date nav (never scrolls) */}
      <div className="shrink-0 space-y-2 px-5 pt-5 pb-2">
        <DialogTitle className="text-lg font-semibold">
          {camera.name}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Live camera feed and snapshot history for {camera.name}
        </DialogDescription>

        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/40">
          {viewingSnapshot ? (
            <>
              <img
                src={viewingSnapshot}
                alt="Historical snapshot"
                className="h-full w-full object-contain"
              />
              <button
                onClick={() => setViewingSnapshot(null)}
                className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/80 active:bg-black/80"
              >
                <Icon icon="mdi:arrow-left" width={14} />
                Back to live
              </button>
            </>
          ) : (
            <>
              {showImage && (
                <img
                  src={imageUrl}
                  alt={camera.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              )}
              {!showImage && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon icon="mdi:camera-off" width={48} className="text-text-dim" />
                </div>
              )}
              {isStreaming ? (
                <>
                  {isProxyCamera ? (
                    signedProxyUrl ? (
                    <img
                      src={`${signedProxyUrl}&_t=${proxyTs}`}
                      alt={camera.name}
                      className="absolute inset-0 h-full w-full object-contain"
                      onLoad={() => setIsPlaying(true)}
                      onError={() => {}}
                    />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon icon="mdi:loading" width={28} className="animate-spin text-white/40" />
                      </div>
                    )
                  ) : (
                  <Go2RtcPlayer
                    stream={camera.go2rtcStream}
                    cameraEntity={camera.entity}
                    className="absolute inset-0 h-full w-full"
                    onPlaying={() => setIsPlaying(true)}
                  />
                  )}
                  {/* Stream overlay buttons */}
                  {camera.hasGateLock && (
                    <button
                      onClick={unlockGate}
                      className="absolute bottom-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-accent/80"
                    >
                      <Icon icon="mdi:lock-open-variant" width={18} />
                    </button>
                  )}
                  <button
                    onClick={takeManualSnapshot}
                    disabled={isTakingSnapshot}
                    className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-black/80 disabled:opacity-50"
                  >
                    <Icon
                      icon={isTakingSnapshot ? "mdi:loading" : "mdi:camera"}
                      width={18}
                      className={isTakingSnapshot ? "animate-spin" : ""}
                    />
                  </button>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon
                    icon="mdi:loading"
                    width={32}
                    className="animate-spin text-white/60"
                  />
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* Scrollable bottom: stats -> sticky date nav -> snapshot grid */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <CameraStats
          battery={battery}
          wifi={wifi}
          charging={charging}
          lastPersonTime={lastPersonTime}
        />

        {/* Date nav -- sticky within this scroll container */}
        <div className="sticky -top-1 z-10 -mx-5 bg-bg-card px-5 pt-3 pb-2">
          <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />
        </div>

        <SnapshotHistory
          cameraId={camera.id}
          selectedDate={selectedDate}
          refreshKey={snapshotRefreshKey}
          onSelect={(url) => setViewingSnapshot(url)}
        />

        {camera.frigateCamera && (
          <CameraFrigateEvents frigateCamera={camera.frigateCamera} />
        )}
      </div>
    </>
  );
}
