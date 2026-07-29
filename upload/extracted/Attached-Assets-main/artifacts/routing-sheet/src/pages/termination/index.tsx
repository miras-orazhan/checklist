import React from 'react';
import { useLocation } from 'wouter';
import {
  useListTerminationSheets,
  getListTerminationSheetsQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, FileX, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'В процессе',
  completed: 'Завершено',
  rejected: 'Отклонено',
  stopped: 'Остановлено',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  in_progress: 'secondary',
  completed: 'default',
  rejected: 'destructive',
  stopped: 'destructive',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  in_progress: <Loader2 className="w-3 h-3 animate-spin" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
  stopped: <AlertTriangle className="w-3 h-3" />,
};

export default function TerminationList() {
  const [, setLocation] = useLocation();

  const { data: sheets, isLoading } = useListTerminationSheets(undefined, {
    query: { queryKey: getListTerminationSheetsQueryKey() }
  });

  return (
    <AppLayout title="Увольнения">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Обходные листы увольнения</h1>
            <p className="text-muted-foreground text-sm mt-1">Управление процессами увольнения сотрудников</p>
          </div>
          <Button onClick={() => setLocation('/termination/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Новое увольнение
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !sheets?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileX className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold text-lg mb-1">Нет листов увольнения</h3>
              <p className="text-muted-foreground text-sm">Создайте первый лист для начала процесса увольнения</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sheets.map(sheet => (
              <Card
                key={sheet.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setLocation(`/termination/${sheet.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{sheet.employeeFullName}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {sheet.branchName} · {sheet.positionName}
                        {sheet.isDoctor && <span className="ml-2 text-blue-600 font-medium">Врач</span>}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[sheet.status] ?? 'secondary'} className="gap-1">
                      {STATUS_ICONS[sheet.status]}
                      {STATUS_LABELS[sheet.status] ?? sheet.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Инициатор: {sheet.initiatorName}</span>
                    <span>
                      Дата увольнения: {format(new Date(sheet.terminationDate), 'dd.MM.yyyy', { locale: ru })}
                    </span>
                    <span>
                      Создан: {format(new Date(sheet.createdAt), 'dd.MM.yyyy', { locale: ru })}
                    </span>
                  </div>
                  {sheet.rejectionReason && (
                    <div className="mt-2 text-sm text-destructive">
                      Причина остановки: {sheet.rejectionReason}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
