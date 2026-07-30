import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListEmailTemplates, useUpdateEmailTemplate, getListEmailTemplatesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, Save, Mail, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const TEMPLATE_NAMES: Record<string, string> = {
  offer_invitation: 'Приглашение на оффер',
  otp_code: 'Код подтверждения (OTP)',
  routing_sheet_confirmation: 'Подтверждение принятия оффера',
  routing_sheet_step_assigned: 'Задача по найму назначена',
  routing_sheet_completed: 'Обходной лист завершён',
  termination_step_assigned: 'Задача по увольнению назначена',
  termination_completed: 'Процесс увольнения завершён',
  termination_rejected: 'Процесс увольнения остановлен',
  sla_reminder: 'Напоминание о просрочке SLA',
  sla_escalation: 'Эскалация просрочки SLA',
};

interface EditState { subject: string; bodyHtml: string; }

export default function AdminEmailTemplates() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openType, setOpenType] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useListEmailTemplates();
  const updateTemplate = useUpdateEmailTemplate();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const getEdit = (type: string, field: keyof EditState): string => {
    const tmpl = templates.find(t => t.templateType === type);
    return edits[type]?.[field] ?? (field === 'subject' ? tmpl?.subject ?? '' : tmpl?.bodyHtml ?? '');
  };

  const setEdit = (type: string, field: keyof EditState, value: string) => {
    setEdits(prev => ({ ...prev, [type]: { ...prev[type], subject: getEdit(type, 'subject'), bodyHtml: getEdit(type, 'bodyHtml'), [field]: value } }));
  };

  const handleSave = async (type: string) => {
    setSaving(type);
    try {
      await updateTemplate.mutateAsync({ type, data: { subject: getEdit(type, 'subject'), bodyHtml: getEdit(type, 'bodyHtml') } });
      toast({ title: 'Шаблон сохранён' });
      qc.invalidateQueries({ queryKey: getListEmailTemplatesQueryKey() });
      setEdits(prev => { const copy = { ...prev }; delete copy[type]; return copy; });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить шаблон', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) return <AppLayout title="Email-шаблоны"><div className="text-center py-12 text-muted-foreground">Загрузка…</div></AppLayout>;

  return (
    <AppLayout title="Email-шаблоны">
      <p className="text-sm text-muted-foreground mb-6">
        Используйте <code className="bg-muted px-1 rounded text-xs">{'{{переменная}}'}</code> для подстановки данных. Список доступных переменных указан в каждом шаблоне.
      </p>
      <div className="space-y-2">
        {templates.map(tmpl => {
          const isOpen = openType === tmpl.templateType;
          const isDirty = !!edits[tmpl.templateType];
          return (
            <div key={tmpl.templateType} className="border rounded-lg overflow-hidden">
              <Collapsible open={isOpen} onOpenChange={open => setOpenType(open ? tmpl.templateType : null)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{TEMPLATE_NAMES[tmpl.templateType] ?? tmpl.templateType}</span>
                      {isDirty && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Несохранённые изменения</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Обновлён: {tmpl.updatedBy ?? 'системой'}</span>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-2 border-t space-y-4">
                    {/* Variables reference */}
                    {tmpl.variables && tmpl.variables.length > 0 && (
                      <div className="bg-muted/40 rounded-md p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Доступные переменные:</p>
                        <div className="flex flex-wrap gap-2">
                          {(tmpl.variables as { name: string; description: string }[]).map(v => (
                            <div key={v.name} className="text-xs">
                              <code className="bg-background border rounded px-1.5 py-0.5">{`{{${v.name}}}`}</code>
                              <span className="text-muted-foreground ml-1">{v.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Тема письма</Label>
                      <Input
                        value={getEdit(tmpl.templateType, 'subject')}
                        onChange={e => setEdit(tmpl.templateType, 'subject', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>HTML-тело письма</Label>
                      <Textarea
                        className="font-mono text-xs min-h-48 resize-y"
                        value={getEdit(tmpl.templateType, 'bodyHtml')}
                        onChange={e => setEdit(tmpl.templateType, 'bodyHtml', e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => handleSave(tmpl.templateType)} disabled={saving === tmpl.templateType}>
                        <Save className="w-4 h-4 mr-2" />
                        {saving === tmpl.templateType ? 'Сохранение…' : 'Сохранить шаблон'}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
