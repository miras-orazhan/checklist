import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, RotateCcw, MapPin, FileText, Check, AlertCircle } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

// ─── Types ───────────────────────────────────────────────────────────────────
// Matches StepMetaRow from routes/admin.ts
interface StepMetaRow {
  sheetKind: 'routing' | 'termination';
  stepType: string;
  label: string;
  cabinet: string;
  instructions: string;
  isCustomized: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

// ─── API helpers (direct fetch — these endpoints aren't in the generated client) ─
async function fetchStepMeta(): Promise<StepMetaRow[]> {
  const token = localStorage.getItem('auth_token');
  const resp = await customFetch<StepMetaRow[]>('/api/admin/step-meta', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp;
}

async function updateStepMeta(
  sheetKind: string,
  stepType: string,
  data: { label: string; cabinet: string; instructions: string },
): Promise<StepMetaRow> {
  const token = localStorage.getItem('auth_token');
  return customFetch<StepMetaRow>(
    `/api/admin/step-meta/${sheetKind}/${stepType}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    },
  );
}

async function resetStepMeta(sheetKind: string, stepType: string): Promise<StepMetaRow> {
  const token = localStorage.getItem('auth_token');
  return customFetch<StepMetaRow>(
    `/api/admin/step-meta/${sheetKind}/${stepType}/reset`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// ─── Editable row component ─────────────────────────────────────────────────
interface EditableRowProps {
  row: StepMetaRow;
  onSaved: () => void;
}

function EditableRow({ row, onSaved }: EditableRowProps) {
  const { toast } = useToast();
  const [label, setLabel] = useState(row.label);
  const [cabinet, setCabinet] = useState(row.cabinet);
  const [instructions, setInstructions] = useState(row.instructions);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Re-sync local state when the row prop changes (e.g. after reset/list refetch)
  useEffect(() => {
    setLabel(row.label);
    setCabinet(row.cabinet);
    setInstructions(row.instructions);
  }, [row.label, row.cabinet, row.instructions]);

  const hasChanges =
    label !== row.label || cabinet !== row.cabinet || instructions !== row.instructions;

  const handleSave = async () => {
    if (!label.trim()) {
      toast({ variant: 'destructive', title: 'Название шага обязательно' });
      return;
    }
    setIsSaving(true);
    try {
      await updateStepMeta(row.sheetKind, row.stepType, {
        label: label.trim(),
        cabinet,
        instructions,
      });
      toast({ title: 'Сохранено', description: `${row.label} обновлён` });
      onSaved();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Ошибка сохранения',
        description: err?.data?.error || err?.message || 'Не удалось сохранить',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Вернуть значения по умолчанию для шага «${row.label}»?`)) return;
    setIsResetting(true);
    try {
      await resetStepMeta(row.sheetKind, row.stepType);
      toast({ title: 'Сброшено', description: `${row.label} — значения по умолчанию` });
      onSaved();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Ошибка сброса',
        description: err?.data?.error || err?.message || 'Не удалось сбросить',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card className={row.isCustomized ? 'border-amber-300/60' : ''}>
      <CardContent className="p-5 space-y-4">
        {/* Header: step type + label + customization badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                {row.stepType}
              </code>
              {row.isCustomized && (
                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">
                  Изменён
                </Badge>
              )}
              {!row.isCustomized && (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  По умолчанию
                </Badge>
              )}
            </div>
            {row.updatedBy && row.updatedAt && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Изменил: {row.updatedBy} • {new Date(row.updatedAt).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Название шага</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: Оформление (HR)"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary/70" />
              Кабинет
            </Label>
            <Input
              value={cabinet}
              onChange={(e) => setCabinet(e.target.value)}
              placeholder="Например: Кабинет HR, 1 этаж, каб. 102"
            />
            <p className="text-[11px] text-muted-foreground">
              Конкретный отдел и номер кабинета, куда идёт кандидат/сотрудник
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <FileText className="w-3 h-3 text-primary/70" />
              Инструкция
            </Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Что принести, что подписать, сколько займёт"
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Что нужно принести, что подписать, сколько времени займёт
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          {row.isCustomized && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isResetting || isSaving}
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-1" />
              )}
              Сбросить
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isResetting}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : hasChanges ? (
              <Save className="w-4 h-4 mr-1" />
            ) : (
              <Check className="w-4 h-4 mr-1 text-emerald-600" />
            )}
            {hasChanges ? 'Сохранить' : 'Сохранено'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function AdminStepMeta() {
  const { user } = useAuth();
  const [rows, setRows] = useState<StepMetaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStepMeta();
      setRows(data);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return (
      <AppLayout title="Доступ запрещён">
        <div className="text-center py-16 text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>Этот раздел доступен только администраторам.</p>
        </div>
      </AppLayout>
    );
  }

  const routingRows = rows.filter((r) => r.sheetKind === 'routing');
  const terminationRows = rows.filter((r) => r.sheetKind === 'termination');

  return (
    <AppLayout title="Кабинеты и инструкции">
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">
          Настройка номеров кабинетов и инструкций для каждого шага обходного листа.
          Эти данные видят кандидаты и сотрудники на своих статус-страницах.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-destructive font-medium mb-1">Ошибка загрузки</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={load}>
              Попробовать снова
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <Tabs defaultValue="routing">
          <TabsList>
            <TabsTrigger value="routing">
              Найм ({routingRows.length})
            </TabsTrigger>
            <TabsTrigger value="termination">
              Увольнение ({terminationRows.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="routing" className="mt-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300">
              <MapPin className="w-4 h-4 inline mr-1" />
              Эти инструкции видят кандидаты на публичной статус-странице
              (ссылка приходит в письме оффера).
            </div>
            {routingRows.map((row) => (
              <EditableRow key={`${row.sheetKind}:${row.stepType}`} row={row} onSaved={load} />
            ))}
          </TabsContent>

          <TabsContent value="termination" className="mt-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300">
              <MapPin className="w-4 h-4 inline mr-1" />
              Эти инструкции видят увольняемые сотрудники на публичной статус-странице
              (ссылка приходит в письме после создания листа увольнения).
            </div>
            {terminationRows.map((row) => (
              <EditableRow key={`${row.sheetKind}:${row.stepType}`} row={row} onSaved={load} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </AppLayout>
  );
}
