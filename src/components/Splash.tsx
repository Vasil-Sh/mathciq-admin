/** Launch screen while the session is checked — same markup and styles (index.html) as before the app loads, so nothing flickers. */
export default function Splash() {
  return (
    <div className="mq-splash" role="status" aria-label="MatchIQ завантажується"><div className="mq-splash-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><g transform="translate(5,6)" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16"/><path d="M3 8h16" className="mq-ax"/><path className="mq-b mq-b1" d="M8 19v-4"/><path className="mq-b mq-b2" d="M14 19V7"/><path className="mq-b mq-b3" d="M20 19v-8"/></g></svg></div><div className="mq-splash-name">MatchIQ <span>Admin</span></div></div>
  );
}
