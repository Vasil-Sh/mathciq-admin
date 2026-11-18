import { useState } from "react";
import { telegramUsername } from "@/lib/telegram";

interface Props {
  username: string;
  telegram?: string | null;
  className?: string;
}

/** Photo results survive remounts so navigating between blocks doesn't flash
 * initials again — the avatar renders with the photo already "on". */
const photoCache = new Map<string, "ok" | "none">();

/**
 * Round avatar for a user. The initials are always there; the Telegram photo
 * fades in over them only once it has really loaded (Telegram serves an empty
 * picture for accounts without a photo, which used to leave a blank circle).
 * The blur-in comes from the animation catalog (Lists · avatars load).
 */
export default function UserAvatar({ username, telegram, className = "" }: Props) {
  const handle = telegramUsername(telegram);
  const [state, setState] = useState<"wait" | "ok" | "none">(
    handle ? photoCache.get(handle) ?? "wait" : "none",
  );
  const initials = (username || "?").slice(0, 2).toUpperCase();
  return (
    <span className={`v3-av v3-av-in ${className}`} aria-hidden="true">
      <span className="v3-av-ini">{initials}</span>
      {handle && state !== "none" && (
        <img
          className={`v3-av-img${state === "ok" ? " is-on" : ""}`}
          src={`https://t.me/i/userpic/320/${handle}.jpg`}
          alt=""
          decoding="async"
          onLoad={(e) => {
            const s = e.currentTarget.naturalWidth > 24 ? "ok" : "none";
            photoCache.set(handle, s);
            setState(s);
          }}
          onError={() => {
            photoCache.set(handle, "none");
            setState("none");
          }}
        />
      )}
    </span>
  );
}
