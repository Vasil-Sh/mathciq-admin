import { useState } from "react";
import { telegramUsername } from "@/lib/telegram";

interface Props {
  username: string;
  telegram?: string | null;
  className?: string;
}

/**
 * Round avatar for a user: their Telegram photo when a handle is known,
 * falling back to the first two letters of the login.
 */
export default function UserAvatar({ username, telegram, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const handle = telegramUsername(telegram);
  const initials = (username || "?").slice(0, 2).toUpperCase();
  return (
    <span className={`v3-av ${className}`} aria-hidden="true">
      {handle && !failed ? (
        <img
          className="v3-av-img"
          src={`https://t.me/i/userpic/320/${handle}.jpg`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
