import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListTerminationSheets, useRestoreTerminationSheet, getListTerminationSheetsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { RotateCcw, Clock, Shield } from 'lucide-react';

function minutesSince(isoDate?: string | null): number {
  if (!isoDate) return Infinity;
  return (Date.now() - new Date(isoDate).getTime()) / 60_000;
}

function formatDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeSinceLabel(isoDate?: string | null): string {
  if (!isoDate) return '';
  const mins = minutesSince(isoDate);
  if (mins < 60) return `${Math.floor(mins)} мин назад`;
  return `${Math.floor(mins / 60)} ч ${Math.floor(mins % 60)} мин назад`;
}

export default function AdminTerminationRestore() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Load both rejected and stopped termination sheets
  const { data: rejectedSheets = [], isLoading: loadingRejected } = useListTerminationSheets({ status: 'rejected' });
  const { data: stoppedSheets = [], isLoading: loadingStopped } = useListTerminationSheets({ status: 'stopped' });
  const restoreSheet = useRestoreTerminationSheet();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const sheets = [...rejectedSheets, ...stoppedSheets].sort((a, b) => {
    const ta = new Date(a.stoppedAt ?? a.rejectedAt ?? 0).getTime();
    const tb = new Date(b.stoppedAt ?? b.rejectedAt ?? 0).getTime();
    return tb - ta;
  });

  const isLoading = loadingRejected || loadingStopped;

  const handleRestore = async () => {
    if (!confirmId) return;
    try {
      await restoreSheet.mutateAsync({ id: confirmId });
      toast({ title: 'Процесс увольнения восстановлен', description: 'Статус изменён обратно на «В процессе»' });
      qc.invalidateQueries({ queryKey: getListTerminationSheetsQueryKey() });
    } catch (err: any) {
      toast({ title: 'Ошибка', description: err?.message ?? 'Не удалось восстановить процесс', variant: 'destructive' });
    } finally {
      setConfirmId(null);
    }
  };

  const stoppedAtField = (s: typeof sheets[0]) => s.stoppedAt ?? s.rejectedAt;

  return (
    <AppLayout title="Восстановление увольнений">
      <p className="text-sm text-muted-foreground mb-6">
        Список остановленных процессов увольнения. Восстановление доступно в течение <strong>1 часа</strong> с момента остановки.
        После истечения срока кнопка блокируется.
      </p>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Загрузка…</div> : sheets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Остановленных процессов увольнения нет</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Сотрудник', 'Статус', 'Причина', 'Остановлен', 'Восстановление'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheets.map(s => {
                const stoppedAt = stoppedAtField(s);
                const mins = minutesSince(stoppedAt);
                const canRestore = mins < 60;
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.employeeFullName}</div>
                      <div className="text-xs text-muted-foreground">{s.branchName} · {s.positionName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="destructive" className="text-xs">
                        {s.status === 'rejected' ? 'Отклонён' : 'Остановлен'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      {s.rejectionReason ?? s.rejectedByName ? (
                        <div>
                          <div>{s.rejectionReason}</div>
                          {s.rejectedByName && <div className="text-xs opacity-70">— {s.rejectedByName}</div>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <div>{formatDateTime(stoppedAt)}</div>
                      <div className="flex items-center gap-1 mt-0.5 opacity-70">
                        <Clock className="w-3 h-3" />
                        {timeSinceLabel(stoppedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canRestore ? (
                        <Button size="sm" variant="outline" onClick={() => setConfirmId(s.id)}>
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />Восстановить
                        </Button>
                      ) : (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Окно истекло
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={confirmId !== null} onOpenChange={open => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить процесс увольнения?</AlertDialogTitle>
            <AlertDialogDescription>
              Статус листа будет изменён обратно на «В процессе». Шаги, которые были одобрены до остановки, остаются одобренными.
              Процесс продолжится с того шага, на котором был остановлен.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Восстановить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
