import { toast } from "sonner";

/**
 * Toast rules from the design: success 4 s, info 3 s, errors stay until closed.
 * Applied once so every existing toast.error / toast.info call follows them;
 * an explicit `duration` passed by a caller still wins.
 */
type Opts = Parameters<typeof toast.error>[1];
const origError = toast.error;
const origInfo = toast.info;
toast.error = ((message: Parameters<typeof toast.error>[0], opts?: Opts) => origError(message, { duration: Infinity, ...opts })) as typeof toast.error;
toast.info = ((message: Parameters<typeof toast.info>[0], opts?: Opts) => origInfo(message, { duration: 3000, ...opts })) as typeof toast.info;
