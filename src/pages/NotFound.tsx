import { Link } from "react-router-dom";

/** 404 from the design: «Сторінку не знайдено». */
export default function NotFound() {
  return (
    <div className="v3-page">
      <section className="v3-notfound" aria-labelledby="nf-title">
        <span className="v3-notfound-code" aria-hidden="true">404</span>
        <h1 id="nf-title">Сторінку не знайдено</h1>
        <p>Можливо, користувача чи банер видалили, або посилання застаріло. Пошукайте в списку або поверніться на дашборд.</p>
        <div className="v3-notfound-actions">
          <Link to="/dashboard" className="v3-btn v3-btn-primary">На дашборд</Link>
          <Link to="/users" className="v3-btn v3-btn-ghost-dark">До користувачів</Link>
        </div>
      </section>
    </div>
  );
}
