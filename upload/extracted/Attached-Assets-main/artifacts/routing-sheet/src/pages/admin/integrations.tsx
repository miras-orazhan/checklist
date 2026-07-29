import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListIntegrationConfigs, useUpdateIntegrationConfig, useListSlaConfigs, useUpdateSlaConfig, useTestBitrix24Connection, getListIntegrationConfigsQueryKey, getListSlaConfigsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Save, CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';

const CONFIG_META: Record<string, { label: string; description: string; secret?: boolean }> = {
  gas_webhook_url: { label: 'GAS Webhook URL', description: 'URL задеплоенного Google Apps Script Web App для отправки email' },
  gas_webhook_secret: { label: 'GAS Webhook Secret', description: 'Shared secret для проверки подлинности запросов к GAS', secret: true },
  app_base_url: { label: 'Публичный URL приложения', description: 'Базовый URL системы (используется в ссылках в письмах). Пример: https://myapp.replit.app' },
  bitrix24_rest_url: { label: 'Bitrix24 REST URL', description: 'REST endpoint с токеном. Пример: https://myorg.bitrix24.ru/rest/1/xxxxxxxx/' },
  bitrix24_responsible_id: { label: 'ID ответственного в Bitrix24', description: 'Числовой ID пользователя Bitrix24 для назначения задач' },
  scheduler_interval_minutes: { label: 'Интервал проверки SLA (мин)', description: 'Как часто запускать проверку SLA. По умолчанию: 30' },
};

const SLA_STEP_NAMES: Record<string, string> = {
  hr_registration: 'Регистрация HR',
  marketing_photo: 'Фото маркетинг',
  tb_briefing: 'Инструктаж ОТ',
  it_accounts: 'IT-аккаунты',
  audit_training: 'Обучение аудит',
  doctor_profile: 'Профиль врача',
  site_publication: 'Публикация на сайте',
  final_review: 'Итоговый контроль',
  chief_physician_off: 'Главный врач (увольнение)',
  it_revocation: 'IT-отзыв доступа',
  marketing_off: 'Маркетинг (увольнение)',
  accounting_off: 'Бухгалтерия (увольнение)',
  security_off: 'Служба безопасности',
  hr_exit_interview: 'Exit-интервью HR',
  hr_close: 'Закрытие HR',
  medical_equipment_off: 'Медтехник (увольнение)',
  account_manager_delete_profile: 'Удаление профиля',
};

export default function AdminIntegrations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [configEdits, setConfigEdits] = useState<Record<string, string>>({});
  const [slaEdits, setSlaEdits] = useState<Record<string, { slaHours?: string; escalationHours?: string }>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const { data: configs = [] } = useListIntegrationConfigs();
  const { data: slaConfigs = [] } = useListSlaConfigs();
  const updateConfig = useUpdateIntegrationConfig();
  const updateSla = useUpdateSlaConfig();
  const testBitrix = useTestBitrix24Connection();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const SECRET_KEYS = ['gas_webhook_secret'];

  // For secret fields: never prefill with the masked placeholder from the API.
  // The input starts blank; only show '*' placeholder text via the input placeholder attr.
  const getConfigValue = (key: string) => {
    const edited = configEdits[key];
    if (edited !== undefined) return edited;
    if (SECRET_KEYS.includes(key)) return ''; // write-only: don't expose mask
    return configs.find(c => c.key === key)?.value ?? '';
  };

  const isSecretSet = (key: string) => {
    if (!SECRET_KEYS.includes(key)) return false;
    const stored = configs.find(c => c.key === key)?.value;
    return !!stored; // "••••••••" from API means it's set
  };

  const handleSaveConfig = async (key: string) => {
    setSaving(key);
    try {
      await updateConfig.mutateAsync({ key, data: { value: configEdits[key] ?? getConfigValue(key) } });
      toast({ title: 'Настройка сохранена' });
      qc.invalidateQueries({ queryKey: getListIntegrationConfigsQueryKey() });
      setConfigEdits(prev => { const c = { ...prev }; delete c[key]; return c; });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const handleTestBitrix = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testBitrix.mutateAsync();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, message: 'Не удалось выполнить запрос' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSla = async (stepType: string) => {
    setSaving(stepType);
    try {
      const edit = slaEdits[stepType];
      const payload: any = {};
      if (edit?.slaHours) payload.slaHours = Number(edit.slaHours);
      if (edit?.escalationHours) payload.escalationHours = Number(edit.escalationHours);
      await updateSla.mutateAsync({ stepType, data: payload });
      toast({ title: 'SLA обновлён' });
      qc.invalidateQueries({ queryKey: getListSlaConfigsQueryKey() });
      setSlaEdits(prev => { const c = { ...prev }; delete c[stepType]; return c; });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить SLA', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const getSlaVal = (stepType: string, field: 'slaHours' | 'escalationHours'): string => {
    const edited = slaEdits[stepType]?.[field];
    if (edited !== undefined) return edited;
    const row = slaConfigs.find(c => c.stepType === stepType);
    return String(row?.[field] ?? '');
  };

  return (
    <AppLayout title="Интеграции и SLA">
      <Tabs defaultValue="connections">
        <TabsList className="mb-6">
          <TabsTrigger value="connections">Подключения</TabsTrigger>
          <TabsTrigger value="sla">Пороги SLA</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4">
          {Object.entries(CONFIG_META).map(([key, meta]) => (
            <Card key={key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{meta.label}</CardTitle>
                <CardDescription className="text-xs">{meta.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      type={meta.secret ? 'password' : 'text'}
                      value={getConfigValue(key)}
                      placeholder={meta.secret ? (isSecretSet(key) ? '● ● ● ● ● ● ● ● (уже задан, введите новый для замены)' : 'Не задано') : 'Не задано'}
                      onChange={e => setConfigEdits(prev => ({ ...prev, [key]: e.target.value }))}
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleSaveConfig(key)}
                    disabled={saving === key || (meta.secret ? !configEdits[key] : false)}
                    title={meta.secret && !configEdits[key] ? 'Введите новый секрет для сохранения' : undefined}
                  >
                    {saving === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                  {key === 'bitrix24_rest_url' && (
                    <Button size="sm" variant="outline" onClick={handleTestBitrix} disabled={testing}>
                      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Проверить'}
                    </Button>
                  )}
                </div>
                {key === 'bitrix24_rest_url' && testResult && (
                  <div className={`flex items-center gap-2 mt-2 text-sm ${testResult.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                    {testResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {testResult.message}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sla">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Шаг', 'Напоминание (ч)', 'Эскалация (ч)', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaConfigs.map(s => (
                  <tr key={s.stepType} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">
                      {SLA_STEP_NAMES[s.stepType] ?? s.stepType}
                      <Badge variant="outline" className="ml-2 text-xs">{s.sheetKind === 'routing' ? 'Найм' : 'Увольнение'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min={1} className="w-24 h-8 text-sm"
                        value={getSlaVal(s.stepType, 'slaHours')}
                        onChange={e => setSlaEdits(prev => ({ ...prev, [s.stepType]: { ...prev[s.stepType], slaHours: e.target.value } }))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min={1} className="w-24 h-8 text-sm"
                        value={getSlaVal(s.stepType, 'escalationHours')}
                        onChange={e => setSlaEdits(prev => ({ ...prev, [s.stepType]: { ...prev[s.stepType], escalationHours: e.target.value } }))}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleSaveSla(s.stepType)} disabled={saving === s.stepType || !slaEdits[s.stepType]}>
                        {saving === s.stepType ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
