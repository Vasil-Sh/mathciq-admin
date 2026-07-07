import { BarChart3, ArrowUpRight, Clock } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 space-y-8">
        <h2 className="text-2xl font-bold text-ink">Дашборд</h2>

        <div className="card-admin p-12 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-card bg-surface-subtle border border-hairline mb-6">
            <BarChart3 className="w-10 h-10 text-subtle" strokeWidth={1.5} />
          </div>
          <h3 className="text-xl font-semibold text-ink mb-2">Аналітика та звіти</h3>
          <p className="text-muted max-w-md mx-auto">
            Тут буде дашборд з ключовими метриками, графіками та аналітикою.
            Ми додамо сюди статистику користувачів, доходи, активність та інше.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6 text-sm text-subtle">
            <Clock className="h-4 w-4" />
            <span>Незабаром</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
