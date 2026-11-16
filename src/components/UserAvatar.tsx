import { useState } from "react";
import { telegramUsername } from "@/lib/telegram";

interface Props {
  username: string;
  telegram?: string | null;
  className?: string;
}

/**
 * Round avatar for a user. The initials are always there; the Telegram photo
 * fades in over them only once it has really loaded (Telegram serves an empty
 * picture for accounts without a photo, which used to leave a blank circle).
 * The blur-in comes from the animation catalog (Lists · avatars load).
 */
export default function UserAvatar({ username, telegram, className = "" }: Props) {
  const [state, setState] = useState<"wait" | "ok" | "none">("wait");
  const handle = telegramUsername(telegram);
  const initials = (username || "?").slice(0, 2).toUpperCase();
  return (
    <span className={`v3-av v3-av-in ${className}`} aria-hidden="true">
      <span className="v3-av-ini">{initials}</span>
      {handle && state !== "none" && (
        <img
          className={`v3-av-img${state === "ok" ? " is-on" : ""}`}
          src={`https://t.me/i/userpic/320/${handle}.jpg`}
          alt=""
          loading="lazy"
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 24 ? "ok" : "none")}
          onError={() => setState("none")}
        />
      )}
    </span>
  );
}
