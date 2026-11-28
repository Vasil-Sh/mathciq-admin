/** While a screen's code loads: a light skeleton of the page (title, four numbers, a card) instead of a line of text. */
export default function RouteFallback({ label }: { label: string }) {
  return (
    <div className="v3-rfb" role="status" aria-label={label}>
      <i className="v3-rfb-t" /><i className="v3-rfb-s" />
      <div className="v3-rfb-k">{[0, 1, 2, 3].map((n) => <i key={n} className={n === 0 ? "is-on" : ""} />)}</div>
      <div className="v3-rfb-c"><i /><i /><i /></div>
    </div>
  );
}
