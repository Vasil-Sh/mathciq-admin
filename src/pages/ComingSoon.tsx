import { Link } from "react-router-dom";

interface Props {
  title: string;
  subtitle: string;
  /** What the section will contain — taken from the approved design. */
  planned: string[];
}

/**
 * Placeholder for sections that are designed but have no backend yet.
 * Shows what is coming instead of fake data.
 */
export default function ComingSoon({ title, subtitle, planned }: Props) {
  return (
    <div className="v3-page">
      <section className="v3-hero">
        <h1 className="v3-title">{title}</h1>
        <p className="v3-subtitle">{subtitle}</p>
      </section>
      <section className="v3-wcard v3-soon">
        <span className="v3-tag">Скоро</span>
        <h2>Розділ готується</h2>
        <p>Дизайн затверджено, інтерфейс з’явиться разом із серверною частиною. Поки що тут нічого не змінюється в даних.</p>
        <ul>
          {planned.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <Link to="/dashboard" className="v3-btn v3-btn-dark">На дашборд</Link>
      </section>
    </div>
  );
}
