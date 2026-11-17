import { Component, type ReactNode } from "react";

/**
 * Keeps the shell (header, menu) alive when a page throws while rendering.
 * Without it a single bad record turns the whole admin into a blank dark screen.
 */
export default class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("[page]", error); }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="v3-page">
        <div className="v3-dcard v3-uerror" role="alert">
          <span className="v3-uerror-ico" aria-hidden="true">!</span>
          <strong>Екран не вдалося показати</strong>
          <span>Щось у даних пішло не так. Інші розділи працюють — спробуйте ще раз або перейдіть в інший розділ.</span>
          <code className="v3-uerror-det">{this.state.error.message}</code>
          <div><button type="button" className="v3-btn v3-btn-blue" onClick={() => this.setState({ error: null })}>Спробувати ще раз</button></div>
        </div>
      </div>
    );
  }
}
