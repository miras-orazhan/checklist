import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  useGetTerminationStep,
  getGetTerminationStepQueryKey,
  useApproveTerminationStep,
  useRejectTerminationStep,
  useGetTerminationSheet,
  getGetTerminationSheetQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, CheckCircle2, XCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

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

export default function TerminationTaskDetail() {
  const params = useParams();
  const stepId = Number(params.stepId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [comment, setComment] = useState('');
  const [exitInterviewNotes, setExitInterviewNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  // Load the single step directly — authorized server-side by role
  const { data: step, isLoading } = useGetTerminationStep(stepId, {
    query: { queryKey: getGetTerminationStepQueryKey(stepId), enabled: !!stepId }
  });

  const { data: sheet } = useGetTerminationSheet((step as any)?.terminationSheetId ?? 0, {
    query: {
      queryKey: getGetTerminationSheetQueryKey((step as any)?.terminationSheetId ?? 0),
      enabled: !!(step as any)?.terminationSheetId,
    }
  });

  const approveMutation = useApproveTerminationStep();
  const rejectMutation = useRejectTerminationStep();

  const handleApprove = () => {
    approveMutation.mutate({
      id: stepId,
      data: {
        comment: comment || undefined,
        exitInterviewNotes: exitInterviewNotes || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Шаг согласован', description: 'Ваше подтверждение записано' });
        setLocation('/termination-tasks');
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось согласовать' });
      }
    });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    rejectMutation.mutate({ id: stepId, data: { reason: rejectReason } }, {
      onSuccess: () => {
        toast({ title: 'Процесс остановлен', description: 'Причина отказа зафиксирована. Процесс увольнения остановлен.', variant: 'destructive' });
        setIsRejectDialogOpen(false);
        setLocation('/termination-tasks');
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось отклонить' });
      }
    });
  };

  if (isLoading) return (
    <AppLayout title="Задача увольнения">
      <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </AppLayout>
  );

  if (!step) return (
    <AppLayout title="Задача увольнения">
      <div className="p-8 text-center text-muted-foreground">Задача не найдена или у вас нет доступа</div>
    </AppLayout>
  );

  const isHrExitInterview = step.stepType === 'hr_exit_interview';
  const isCompleted = step.status !== 'pending';

  return (
    <AppLayout title={STEP_LABELS[step.stepType] ?? step.stepType}>
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/termination-tasks')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
          <h1 className="text-xl font-bold">{STEP_LABELS[step.stepType] ?? step.stepType}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Информация о сотруднике</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Сотрудник:</span> <strong>{(step as any).employeeFullName}</strong></div>
            <div><span className="text-muted-foreground">Филиал:</span> {(step as any).branchName}</div>
            <div><span className="text-muted-foreground">Должность:</span> {(step as any).positionName}</div>
            {(step as any).isDoctor && <div><span className="text-blue-600 font-medium">Врач</span></div>}
            {sheet && (
              <div><span className="text-muted-foreground">Дата увольнения:</span> {format(new Date(sheet.terminationDate), 'dd.MM.yyyy', { locale: ru })}</div>
            )}
          </CardContent>
        </Card>

        {isCompleted ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6">
              {step.status === 'approved' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              ) : (
                <XCircle className="w-6 h-6 text-red-500" />
              )}
              <div>
                <p className="font-medium">{step.status === 'approved' ? 'Шаг согласован' : 'Шаг отклонён'}</p>
                {step.comment && <p className="text-sm text-muted-foreground">{step.comment}</p>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ваше решение</CardTitle>
              <CardDescription>Согласуйте или отклоните этот шаг. Отклонение остановит весь процесс увольнения.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Комментарий (необязательно)</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Добавьте комментарий..."
                  rows={3}
                />
              </div>

              {isHrExitInterview && (
                <div className="space-y-2">
                  <Label>Заметки выходного интервью</Label>
                  <Textarea
                    value={exitInterviewNotes}
                    onChange={(e) => setExitInterviewNotes(e.target.value)}
                    placeholder="Записи с выходного интервью сотрудника..."
                    rows={5}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Согласовать
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setIsRejectDialogOpen(true)}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Отклонить
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Отклонить и остановить процесс?
            </DialogTitle>
            <DialogDescription>
              Это действие остановит весь процесс увольнения. Администратор сможет восстановить процесс в течение 1 часа.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Label>Причина отклонения *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Укажите причину отклонения..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Подтвердить отклонение
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
