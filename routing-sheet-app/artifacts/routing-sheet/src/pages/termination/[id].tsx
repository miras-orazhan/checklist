import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  useGetTerminationSheet,
  getGetTerminationSheetQueryKey,
  useRestoreTerminationSheet,
  useCloseTerminationSheet,
  useOverrideTerminationStep,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Clock, XCircle, AlertTriangle, ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthContext';

const STEP_LABELS: Record<string, string> = {
  chief_physician_off: 'Согласование главного врача',
  it_revocation: 'Отзыв IT-доступов',
  marketing_off: 'Маркетинговое оформление',
  accounting_off: 'Финансовый расчёт',
  security_off: 'Проверка безопасности',
  hr_exit_interview: 'Интервью HR-адаптации',
  hr_close: 'Закрытие HR-специалистом',
  medical_equipment_off: 'Медтехника и оборудование',
  account_manager_delete_profile: 'Удаление профиля с сайтов',
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  in_progress: { label: 'В процессе', icon: <Loader2 className="w-4 h-4 animate-spin" />, color: 'text-amber-600' },
  completed: { label: 'Завершено', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600' },
  rejected: { label: 'Отклонено', icon: <XCircle className="w-4 h-4" />, color: 'text-red-600' },
  stopped: { label: 'Остановлено', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-600' },
  pending: { label: 'Ожидает', icon: <Clock className="w-4 h-4" />, color: 'text-muted-foreground' },
  approved: { label: 'Согласовано', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600' },
  skipped: { label: 'Пропущено', icon: <RefreshCw className="w-4 h-4" />, color: 'text-muted-foreground' },
};

export default function TerminationDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [overrideStepId, setOverrideStepId] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const { data: sheet, isLoading, refetch } = useGetTerminationSheet(id, {
    query: { queryKey: getGetTerminationSheetQueryKey(id), enabled: !!id }
  });

  const restoreMutation = useRestoreTerminationSheet();
  const closeMutation = useCloseTerminationSheet();
  const overrideMutation = useOverrideTerminationStep();

  const handleRestore = () => {
    restoreMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Процесс восстановлен', description: 'Отклонённый шаг сброшен до ожидания' });
        refetch();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось восстановить' });
      }
    });
  };

  const handleClose = () => {
    closeMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Лист закрыт', description: 'Процесс увольнения завершён' });
        refetch();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось закрыть' });
      }
    });
  };

  const handleOverride = () => {
    if (!overrideStepId || !overrideReason.trim()) return;
    overrideMutation.mutate({ id: overrideStepId, data: { reason: overrideReason } }, {
      onSuccess: () => {
        toast({ title: 'Шаг подтверждён вручную' });
        setOverrideStepId(null);
        setOverrideReason('');
        refetch();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Ошибка подтверждения' });
      }
    });
  };

  if (isLoading) return (
    <AppLayout title="Лист увольнения">
      <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </AppLayout>
  );

  if (!sheet) return (
    <AppLayout title="Лист увольнения">
      <div className="p-8 text-center text-muted-foreground">Лист не найден</div>
    </AppLayout>
  );

  const sheetStatus = STATUS_CONFIG[sheet.status] ?? STATUS_CONFIG.pending;
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const canClose = (isAdmin || isHR) && sheet.status === 'in_progress';
  const canRestore = isAdmin && ['stopped', 'rejected'].includes(sheet.status);

  // Calculate progress
  const blockingSteps = sheet.steps.filter((s: any) => s.isBlocking);
  const approvedCount = blockingSteps.filter((s: any) => s.status === 'approved' || s.status === 'skipped').length;
  const progress = blockingSteps.length ? Math.round((approvedCount / blockingSteps.length) * 100) : 0;

  return (
    <AppLayout title={`Увольнение: ${sheet.employeeFullName}`}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/termination')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
          <h1 className="text-xl font-bold">{sheet.employeeFullName}</h1>
          <Badge variant={sheet.status === 'completed' ? 'default' : sheet.status === 'in_progress' ? 'secondary' : 'destructive'} className={`gap-1 ${sheetStatus.color}`}>
            {sheetStatus.icon}
            {sheetStatus.label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Филиал:</span> <span className="font-medium">{sheet.branchName}</span></div>
              <div><span className="text-muted-foreground">Должность:</span> <span className="font-medium">{sheet.positionName}</span></div>
              {sheet.isDoctor && <div><Badge variant="outline" className="text-blue-600 border-blue-300">Врач</Badge></div>}
              <div><span className="text-muted-foreground">Дата увольнения:</span> <span className="font-medium">{format(new Date(sheet.terminationDate), 'dd.MM.yyyy', { locale: ru })}</span></div>
              <div><span className="text-muted-foreground">Инициатор:</span> <span className="font-medium">{sheet.initiatorName}</span></div>
              <div><span className="text-muted-foreground">Создан:</span> <span className="font-medium">{format(new Date(sheet.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })}</span></div>

              {/* Progress indicator */}
              <div className="pt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Прогресс</span>
                  <span>{approvedCount}/{blockingSteps.length}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {sheet.rejectionReason && (
                <div className="p-3 bg-destructive/10 rounded-md text-destructive text-xs">
                  <strong>Причина остановки:</strong> {sheet.rejectionReason}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                {canRestore && (
                  <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoreMutation.isPending}>
                    {restoreMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                    Восстановить процесс
                  </Button>
                )}
                {canClose && (
                  <Button variant="default" size="sm" onClick={handleClose} disabled={closeMutation.isPending || approvedCount < blockingSteps.length}>
                    {closeMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    Закрыть лист
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Steps Progress (traffic-light) */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Статус согласований</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {sheet.steps.map((step: any) => {
                    const sc = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
                    return (
                      <div key={step.id} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className={`${sc.color}`}>{sc.icon}</div>
                          <div>
                            <p className="font-medium text-sm">{STEP_LABELS[step.stepType] ?? step.stepType}</p>
                            <p className="text-xs text-muted-foreground">{step.assignedRole}</p>
                            {step.comment && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">"{step.comment}"</p>
                            )}
                            {step.exitInterviewNotes && (
                              <p className="text-xs text-muted-foreground mt-0.5">Заметки: {step.exitInterviewNotes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={step.status === 'approved' ? 'default' : step.status === 'rejected' ? 'destructive' : 'secondary'} className="text-xs">
                            {sc.label}
                          </Badge>
                          {step.completedByName && (
                            <span className="text-xs text-muted-foreground">{step.completedByName}</span>
                          )}
                          {(isAdmin || isHR) && step.status === 'pending' && sheet.status === 'in_progress' && (
                            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setOverrideStepId(step.id)}>
                              Подтвердить вручную
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Override Dialog */}
      <Dialog open={!!overrideStepId} onOpenChange={(open) => { if (!open) { setOverrideStepId(null); setOverrideReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подтвердить шаг вручную</DialogTitle>
            <DialogDescription>Используйте это действие если ответственная роль отсутствует в филиале.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Label>Причина ручного подтверждения</Label>
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Например: Должность отсутствует в данном филиале"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOverrideStepId(null); setOverrideReason(''); }}>Отмена</Button>
            <Button onClick={handleOverride} disabled={!overrideReason.trim() || overrideMutation.isPending}>
              {overrideMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
