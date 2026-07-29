import React from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateTerminationSheet,
  useListBranches,
  getListBranchesQueryKey,
  useListPositions,
  getListPositionsQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';

const schema = z.object({
  employeeFullName: z.string().min(2, 'Введите ФИО сотрудника'),
  branchId: z.string().min(1, 'Выберите филиал'),
  positionId: z.string().min(1, 'Выберите должность'),
  terminationDate: z.string().min(1, 'Укажите дату увольнения'),
});

type FormValues = z.infer<typeof schema>;

export default function NewTermination() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });
  const { data: positions } = useListPositions({ query: { queryKey: getListPositionsQueryKey() } });
  const createMutation = useCreateTerminationSheet();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { employeeFullName: '', branchId: '', positionId: '', terminationDate: '' },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      data: {
        employeeFullName: values.employeeFullName,
        branchId: Number(values.branchId),
        positionId: Number(values.positionId),
        terminationDate: new Date(values.terminationDate).toISOString(),
      }
    }, {
      onSuccess: (data) => {
        toast({ title: 'Лист увольнения создан', description: `Задачи отправлены всем ответственным ролям` });
        setLocation(`/termination/${(data as any).id}`);
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось создать лист' });
      }
    });
  };

  return (
    <AppLayout title="Новое увольнение">
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/termination')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
          <h1 className="text-2xl font-bold">Новый лист увольнения</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Данные сотрудника</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label>ФИО сотрудника</Label>
                <Input
                  {...form.register('employeeFullName')}
                  placeholder="Иванов Иван Иванович"
                />
                {form.formState.errors.employeeFullName && (
                  <p className="text-xs text-destructive">{form.formState.errors.employeeFullName.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Филиал</Label>
                  <Select
                    onValueChange={(v) => form.setValue('branchId', v)}
                    value={form.watch('branchId')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите филиал..." />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map(b => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.branchId && (
                    <p className="text-xs text-destructive">{form.formState.errors.branchId.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Должность</Label>
                  <Select
                    onValueChange={(v) => form.setValue('positionId', v)}
                    value={form.watch('positionId')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите должность..." />
                    </SelectTrigger>
                    <SelectContent>
                      {positions?.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}{p.isDoctor ? ' (врач)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.positionId && (
                    <p className="text-xs text-destructive">{form.formState.errors.positionId.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Дата увольнения</Label>
                <Input
                  type="date"
                  {...form.register('terminationDate')}
                />
                {form.formState.errors.terminationDate && (
                  <p className="text-xs text-destructive">{form.formState.errors.terminationDate.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Создать лист и запустить процесс
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
