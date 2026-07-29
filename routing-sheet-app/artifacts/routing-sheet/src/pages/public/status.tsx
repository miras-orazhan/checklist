import React from 'react';
import { useParams } from 'wouter';
import { useGetCandidateStatus, getGetCandidateStatusQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

const STEP_LABELS: Record<string, string> = {
  hr_registration: 'Оформление (HR)',
  marketing_photo: 'Фото (Маркетинг)',
  tb_briefing: 'Инструктаж ТБ',
  it_accounts: 'Учетные записи (IT)',
  audit_training: 'Обучение (Аудит)',
  doctor_profile: 'Профиль врача',
  site_publication: 'Публикация на сайте',
  final_review: 'Финальная проверка',
};

export default function StatusPublic() {
  const params = useParams();
  const token = params.token || '';

  const { data: statusInfo, isLoading, error } = useGetCandidateStatus(token, {
    query: { queryKey: getGetCandidateStatusQueryKey(token), enabled: !!token, refetchInterval: 30000 }
  });

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-900"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (error || !statusInfo) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-bold mb-2 text-destructive">Ошибка доступа</h2>
            <p className="text-muted-foreground">Информация недоступна или ссылка устарела.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAllDone = statusInfo.overallStatus === 'completed';

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 selection:bg-primary/20">
      <div className="w-full max-w-md space-y-6">
        
        <div className="text-center space-y-2 mb-8">
          <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg ${isAllDone ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-primary text-primary-foreground shadow-primary/20'}`}>
            {isAllDone ? <CheckCircle2 className="w-10 h-10" /> : <Clock className="w-10 h-10" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isAllDone ? 'Оформление завершено!' : 'Процесс оформления'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {statusInfo.candidateName}, отслеживайте статус вашего трудоустройства.
          </p>
        </div>

        <Card className="border-border shadow-xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary to-blue-500"></div>
          <CardHeader className="pb-4 border-b border-border bg-muted/20">
            <CardTitle className="text-lg">Обходной лист</CardTitle>
            <CardDescription>
              Мы подготавливаем всё необходимое для вашей работы. Страница обновляется автоматически.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {statusInfo.steps.map((step, index) => {
                const isDone = step.status === 'completed';
                const label = STEP_LABELS[step.stepType] ?? step.stepType;
                return (
                  <div key={index} className={`p-4 flex items-center gap-4 transition-colors ${isDone ? 'bg-muted/10' : 'bg-background'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-500'}`}>
                      {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-foreground">{label}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isDone ? 'Готово' : 'В процессе'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {isAllDone && (
              <div className="p-6 bg-emerald-500/5 text-center border-t border-border">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Поздравляем! Все этапы пройдены. Мы ждем вас в первый рабочий день.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
