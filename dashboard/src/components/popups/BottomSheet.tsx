import { useRef, useCallback, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { Icon } from "@iconify/react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes on the content panel (e.g. max-w, overflow) */
  className?: string;
  /** When true, skip backdrop blur (for popups opened from within another popup) */
  nested?: boolean;
}

const DISMISS_FRACTION = 0.25;
const VELOCITY_THRESHOLD = 0.4;
const SCROLL_LOCK_MS = 100;
const SPRING = { type: "spring" as const, damping: 35, stiffness: 380 };

function canDragFrom(
  el: EventTarget,
  lastScrollRef: React.MutableRefObject<number>,
): boolean {
  let node = el as HTMLElement;
  const now = Date.now();

  if (lastScrollRef.current && now - lastScrollRef.current < SCROLL_LOCK_MS) {
    lastScrollRef.current = now;
    return false;
  }

  while (node) {
    if (node.nodeType !== 1) { node = node.parentNode as HTMLElement; continue; }
    if (node.hasAttribute("data-no-drag")) return false;
    if (node.scrollHeight > node.clientHeight && node.scrollTop !== 0) {
      lastScrollRef.current = now;
      return false;
    }
    if (node.getAttribute("role") === "dialog") return true;
    node = node.parentNode as HTMLElement;
  }
  return true;
}

export function BottomSheet({ open, onClose, children, className = "", nested }: BottomSheetProps) {
  const y = useMotionValue(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastScrollTime = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    startY.current = e.pageY;
    startTime.current = Date.now();
    dragging.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startY.current) return;
    const delta = e.pageY - startY.current;

    if (!dragging.current) {
      if (delta <= 0) return;
      const target = e.target as HTMLElement;
      const isHandle = target.hasAttribute("data-drag-handle") || !!target.closest("[data-drag-handle]");
      if (!isHandle && !canDragFrom(e.target, lastScrollTime)) return;
      dragging.current = true;
    }

    y.set(delta < 0 ? delta * 0.1 : delta);
    e.preventDefault();
  }, [y]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startY.current) return;
    const delta = e.pageY - startY.current;
    const velocity = Math.abs(delta) / (Date.now() - startTime.current);
    const height = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight;

    if (dragging.current && delta > 0 && (velocity > VELOCITY_THRESHOLD || delta > height * DISMISS_FRACTION)) {
      animate(y, height, { ...SPRING, onComplete: onClose });
    } else {
      animate(y, 0, SPRING);
    }
    startY.current = 0;
    dragging.current = false;
  }, [y, onClose]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            {/* Backdrop */}
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`fixed inset-0 z-50 bg-black/60 ${nested ? "" : "backdrop-blur-sm"}`}
              />
            </Dialog.Overlay>

            {/* Sheet */}
            <Dialog.Content asChild>
              <motion.div
                ref={sheetRef}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={SPRING}
                style={{ y }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className={`fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-3xl bg-bg-primary pb-[env(safe-area-inset-bottom)] shadow-2xl md:inset-auto md:left-1/2 md:top-1/2 md:h-[85vh] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl ${className}`}
              >
                {/* Drag handle + close button */}
                <div
                  className="flex shrink-0 items-center justify-between px-4 pt-3 pb-1 touch-none"
                  data-drag-handle
                >
                  {/* Spacer to centre the pill */}
                  <div className="w-8" />
                  <div className="h-1 w-10 rounded-full bg-white/20" />
                  <button
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-text-secondary hover:bg-white/16 active:scale-95 transition-all"
                    aria-label="Lukk"
                  >
                    <Icon icon="mdi:close" width={18} />
                  </button>
                </div>

                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
