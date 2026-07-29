import React from 'react';
import { useLocation } from 'wouter';
import {
  useListTerminationSteps,
  getListTerminationStepsQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckSquare, Clock, UserCog } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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

export default function TerminationTasks() {
  const [, setLocation] = useLocation();

  const { data: steps, isLoading } = useListTerminationSteps(
    { pending: true },
    { query: { queryKey: getListTerminationStepsQueryKey({ pending: true }) } }
  );

  return (
    <AppLayout title="Задачи увольнения">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Мои задачи увольнения</h1>
          <p className="text-muted-foreground text-sm mt-1">Ожидающие вашего согласования</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !steps?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckSquare className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold text-lg mb-1">Нет ожидающих задач</h3>
              <p className="text-muted-foreground text-sm">Все задачи обработаны</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {steps.map((step: any) => (
              <Card
                key={step.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setLocation(`/termination-tasks/${step.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
                        <UserCog className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{STEP_LABELS[step.stepType] ?? step.stepType}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {step.employeeFullName} · {step.branchName}
                          {step.isDoctor && <span className="ml-2 text-blue-600 text-xs">Врач</span>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(step.createdAt), 'dd.MM.yyyy', { locale: ru })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="w-3 h-3" />
                      Ожидает
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
