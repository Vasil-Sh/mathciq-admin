import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)} {...props} />;
}

/** Phone sheets: drag the grab bar down to close (or tap it). Hidden on wider screens by CSS. */
function GrabBar({ contentRef, closeRef }: { contentRef: React.RefObject<HTMLDivElement | null>; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const st = React.useRef({ y0: 0, dy: 0, on: false });
  const set = (dy: number, anim: boolean) => { const el = contentRef.current; if (!el) return; el.style.transition = anim ? "transform .3s cubic-bezier(.2,.9,.25,1)" : "none"; el.style.transform = dy ? `translateY(${dy}px)` : ""; };
  return (
    <button type="button" className="v3-grab" aria-label="Закрити"
      onPointerDown={(e) => { st.current = { y0: e.clientY, dy: 0, on: true }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (!st.current.on) return; st.current.dy = Math.max(0, e.clientY - st.current.y0); set(st.current.dy, false); }}
      onPointerUp={() => { if (!st.current.on) return; st.current.on = false; const dy = st.current.dy; if (dy > 90 || dy < 6) { set(window.innerHeight, true); window.setTimeout(() => closeRef.current?.click(), 180); } else set(0, true); }}
      onPointerCancel={() => { st.current.on = false; set(0, true); }}>
      <span aria-hidden="true" />
    </button>
  );
}

/** Toasts and floating pickers live outside the dialog: tapping them must not close it. */
const keepOpen = (e: Event) => { const t = e.target as Element | null; return !!t?.closest?.("[data-sonner-toaster], .v3-date-scrim, .v3-date-pop, [data-v3-float]"); };

/**
 * Phone sheets and the on-screen keyboard (iOS).
 * - When iOS does not move the sheet above the keyboard (often on the first focus, while the sheet is still sliding in),
 *   we lift it ourselves: --v3-kb is the part of the screen the keyboard covers, --v3-vvh the visible height.
 * - Behind the keyboard's translucent bar the sheet's white continues (CSS), not the page.
 * - When the keyboard closes, the page is put back where it was, so no gap is left under the sheet.
 */
function useSheetKeyboard() {
  React.useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const root = document.documentElement;
    root.classList.add("v3-sheet-open");
    const y0 = window.scrollY;
    const vv = window.visualViewport;
    if (!vv) return () => root.classList.remove("v3-sheet-open");
    // A dialog that focuses its search on open brings the keyboard up before this runs: start from the full layout
    // height, or the open keyboard would be taken as «closed» (no lift, no white under its bar — the page shows through).
    let max = Math.max(vv.height, document.documentElement.clientHeight);
    const fill = document.createElement("div");
    fill.setAttribute("aria-hidden", "true");
    fill.style.cssText = "position:absolute;left:0;right:0;height:600px;z-index:2147482000;pointer-events:none;display:none";
    document.body.appendChild(fill);
    const apply = () => {
      if (vv.height > max) max = vv.height;
      const layout = document.documentElement.clientHeight;
      const kb = Math.max(0, Math.round(layout - vv.height - vv.offsetTop));
      root.style.setProperty("--v3-kb", `${kb > 40 ? kb : 0}px`);
      root.style.setProperty("--v3-vvh", `${Math.round(vv.height)}px`);
      const kbOpen = max - vv.height > 120;
      root.classList.toggle("v3-kb-open", kbOpen);
      // The strip under the keyboard's translucent bar shows the page below the visible area, not fixed layers:
      // put a block of the sheet's colour right there (in page coordinates), so it reads as the sheet continuing.
      if (kbOpen) {
        const sheet = document.querySelector<HTMLElement>(".v3-modal[data-state=\"open\"], .v3-sheet[data-state=\"open\"]");
        fill.style.background = sheet ? getComputedStyle(sheet).backgroundColor : "#fff";
        fill.style.top = `${Math.round(vv.pageTop + vv.height) - 2}px`;
        fill.style.display = "block";
      } else fill.style.display = "none";
      if (vv.height >= max - 1 && window.scrollY !== y0) window.scrollTo(window.scrollX, y0);
    };
    const later = () => { apply(); window.setTimeout(apply, 120); window.setTimeout(apply, 420); };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
      fill.remove();
      // Only the last open sheet removes these.
      window.setTimeout(() => { if (!document.querySelector(".v3-modal[data-state=\"open\"], .v3-sheet[data-state=\"open\"]")) { root.classList.remove("v3-sheet-open", "v3-kb-open"); root.style.removeProperty("--v3-kb"); root.style.removeProperty("--v3-vvh"); } }, 300);
    };
  }, []);
}

/** Mounted inside the dialog content, so it runs only while the dialog is open. */
function SheetKeyboard() { useSheetKeyboard(); return null; }

function DialogContent({ className, children, onInteractOutside, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { onInteractOutside?: (e: Event) => void }) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        onInteractOutside={(e) => { if (keepOpen(e)) { e.preventDefault(); return; } onInteractOutside?.(e); }}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4",
          "adm-dialog border border-hairline bg-surface p-6 shadow-lg rounded-card",
          "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        <SheetKeyboard />
        <GrabBar contentRef={contentRef} closeRef={closeRef} />
        {children}
        <DialogPrimitive.Close ref={closeRef} className="v3-modal-x absolute right-4 top-4 rounded-btn text-subtle hover:text-ink transition-colors focus:outline-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-xl font-semibold text-ink", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted", className)} {...props} />;
}

export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
