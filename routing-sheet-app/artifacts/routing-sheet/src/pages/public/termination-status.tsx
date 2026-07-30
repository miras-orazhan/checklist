import React from 'react';
import { useParams } from 'wouter';
import { useGetTerminationStatus, getGetTerminationStatusQueryKey } from '@workspace/api-client-react';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, MapPin, FileText } from 'lucide-react';

const STEP_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending:  { icon: <Clock className="w-5 h-5" />,        color: 'text-muted-foreground', label: 'Ожидает' },
  approved: { icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-emerald-600',      label: 'Согласовано' },
  rejected: { icon: <XCircle className="w-5 h-5" />,      color: 'text-red-600',           label: 'Отклонено' },
  skipped:  { icon: <Clock className="w-5 h-5" />,        color: 'text-muted-foreground', label: 'Пропущено' },
};

const SHEET_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  in_progress: { label: 'В обработке',  color: 'text-amber-600',   icon: <Loader2 className="w-5 h-5 animate-spin" /> },
  completed:   { label: 'Завершено',    color: 'text-emerald-600', icon: <CheckCircle2 className="w-5 h-5" /> },
  rejected:    { label: 'Отклонено',    color: 'text-red-600',     icon: <XCircle className="w-5 h-5" /> },
  stopped:     { label: 'Остановлено',  color: 'text-red-600',     icon: <AlertTriangle className="w-5 h-5" /> },
};

export default function TerminationStatusPublic() {
  const params = useParams();
  const token = params.token as string;

  const { data, isLoading, error } = useGetTerminationStatus(token, {
    query: { queryKey: getGetTerminationStatusQueryKey(token), enabled: !!token }
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        <AlertTriangle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Страница не найдена</h2>
        <p className="text-muted-foreground text-sm">Ссылка недействительна или истекла</p>
      </div>
    </div>
  );

  const sheetConfig = SHEET_STATUS_CONFIG[data.status] ?? SHEET_STATUS_CONFIG.in_progress;
  const isStopped = data.status === 'stopped' || data.status === 'rejected';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-base font-bold text-foreground">Обходной лист увольнения</h1>
          <div className={`flex items-center gap-1.5 text-sm font-medium ${sheetConfig.color}`}>
            {sheetConfig.icon}
            {sheetConfig.label}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-6">
        {/* Employee Info */}
        <div className="bg-card rounded-2xl p-5 border shadow-sm">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Сотрудник</p>
          <h2 className="text-lg font-bold">{data.employeeFullName}</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Отслеживайте статус вашего увольнения. Страница обновляется автоматически —
            от вас требуется только пройти шаги, где указано, что нужно сделать.
          </p>
        </div>

        {/* Steps */}
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold text-sm">Статус согласований</h3>
          </div>
          <div className="divide-y divide-border">
            {data.steps.map((step: any, idx: number) => {
              const sc = STEP_STATUS_CONFIG[step.status] ?? STEP_STATUS_CONFIG.pending;
              const isDone = step.status === 'approved' || step.status === 'skipped';
              const hasDetails = Boolean(step.cabinet || step.instructions);
              return (
                <div key={idx} className={`px-5 py-4 ${isDone ? 'bg-muted/10' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{step.label}</span>
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${sc.color} flex-shrink-0`}>
                      {sc.icon}
                      <span className="hidden sm:inline">{sc.label}</span>
                    </div>
                  </div>

                  {hasDetails && (
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {step.cabinet && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/70" />
                          <span className="leading-relaxed">{step.cabinet}</span>
                        </div>
                      )}
                      {step.instructions && (
                        <div className="flex items-start gap-2">
                          <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/70" />
                          <span className="leading-relaxed">{step.instructions}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {data.status === 'completed' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-emerald-800">Все согласования пройдены</p>
            <p className="text-sm text-emerald-600 mt-1">Процесс увольнения завершён</p>
          </div>
        )}

        {isStopped && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p className="font-semibold text-red-800">Процесс остановлен</p>
            <p className="text-sm text-red-600 mt-1">Обратитесь к HR-специалисту для уточнения деталей</p>
          </div>
        )}
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Цифровой обходной лист — система автоматизации HR
      </footer>
    </div>
  );
}
