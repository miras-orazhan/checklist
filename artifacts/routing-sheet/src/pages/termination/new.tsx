import React, { useState, useMemo } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Search, UserCheck, UserPlus } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

const schema = z.object({
  employeeFullName: z.string().min(2, 'Введите ФИО сотрудника'),
  branchId: z.string().min(1, 'Выберите филиал'),
  positionId: z.string().min(1, 'Выберите должность'),
  email: z.string().email('Введите корректный email').optional().or(z.literal('')),
  iin: z.string()
    .optional()
    .refine((v) => !v || /^\d{12}$/.test(v), 'ИИН должен содержать 12 цифр'),
  terminationDate: z.string().min(1, 'Укажите дату увольнения'),
});

type FormValues = z.infer<typeof schema>;

interface Candidate {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  iin: string;
  routingSheet?: {
    branchId: number;
    branchName?: string;
    positionId: number;
    positionName?: string;
    isDoctor: boolean;
  } | null;
}

export default function NewTermination() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });
  const { data: positions } = useListPositions({ query: { queryKey: getListPositionsQueryKey() } });
  const createMutation = useCreateTerminationSheet();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Candidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { employeeFullName: '', branchId: '', positionId: '', email: '', iin: '', terminationDate: '' },
  });

  // Search candidates by ИИН or name
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const token = localStorage.getItem('auth_token');
      const results = await customFetch<Candidate[]>(`/api/candidates?search=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSearchResults(results);
    } catch {
      toast({ variant: 'destructive', title: 'Ошибка поиска', description: 'Не удалось выполнить поиск' });
    } finally {
      setIsSearching(false);
    }
  };

  // Select a candidate from search results — pre-fill the form
  const handleSelectCandidate = (c: Candidate) => {
    setSelectedCandidate(c);
    setManualMode(false);
    form.reset({
      employeeFullName: c.fullName,
      branchId: c.routingSheet?.branchId ? String(c.routingSheet.branchId) : '',
      positionId: c.routingSheet?.positionId ? String(c.routingSheet.positionId) : '',
      email: c.email || '',
      iin: c.iin || '',
      terminationDate: '',
    });
    setSearchResults([]);
    setSearchQuery('');
    toast({ title: 'Кандидат найден', description: `${c.fullName} — данные заполнены автоматически` });
  };

  // Switch to manual entry mode
  const handleManualEntry = () => {
    setManualMode(true);
    setSelectedCandidate(null);
    form.reset({ employeeFullName: '', branchId: '', positionId: '', email: '', iin: '', terminationDate: '' });
  };

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      data: {
        employeeFullName: values.employeeFullName,
        branchId: Number(values.branchId),
        positionId: Number(values.positionId),
        email: values.email || undefined,
        iin: values.iin || undefined,
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

  const showForm = selectedCandidate || manualMode;

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

        {/* Step 1: Search for candidate in registry */}
        {!showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Поиск сотрудника в реестре</CardTitle>
              <CardDescription>
                Сначала проверьте, есть ли сотрудник в реестре. Если найден — данные
                заполнятся автоматически. Если нет — введите вручную.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Введите ФИО или ИИН..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                  {isSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Найти
                </Button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Найдено: {searchResults.length}</p>
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCandidate(c)}
                      className="w-full text-left p-3 border rounded-lg hover:bg-muted/30 transition-colors flex items-center gap-3"
                    >
                      <UserCheck className="w-5 h-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{c.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          ИИН: {c.iin} • {c.routingSheet?.positionName || '—'} • {c.routingSheet?.branchName || '—'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !isSearching && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Ничего не найдено. Введите данные вручную.
                </p>
              )}

              <div className="pt-2 border-t">
                <Button variant="outline" onClick={handleManualEntry} className="w-full">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Ввести данные вручную
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Form (pre-filled or manual) */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Данные сотрудника</CardTitle>
              <CardDescription>
                {selectedCandidate
                  ? `Найден в реестре: ${selectedCandidate.fullName}. Проверьте данные и укажите дату увольнения.`
                  : 'Введите данные сотрудника вручную.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label>ФИО сотрудника *</Label>
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
                    <Label>Филиал *</Label>
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
                    <Label>Должность *</Label>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      {...form.register('email')}
                      placeholder="ivanov@example.com"
                    />
                    {form.formState.errors.email && (
                      <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>ИИН</Label>
                    <Input
                      {...form.register('iin')}
                      placeholder="123456789012"
                      maxLength={12}
                      inputMode="numeric"
                    />
                    {form.formState.errors.iin && (
                      <p className="text-xs text-destructive">{form.formState.errors.iin.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Дата увольнения *</Label>
                  <Input
                    type="date"
                    {...form.register('terminationDate')}
                  />
                  {form.formState.errors.terminationDate && (
                    <p className="text-xs text-destructive">{form.formState.errors.terminationDate.message}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  {!manualMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSelectedCandidate(null);
                        setManualMode(false);
                        form.reset();
                      }}
                    >
                      ← Назад к поиску
                    </Button>
                  )}
                  <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2" />}
                    Создать лист и запустить процесс
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
