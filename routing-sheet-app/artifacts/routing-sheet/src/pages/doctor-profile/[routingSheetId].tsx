import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  useGetDoctorProfile,
  getGetDoctorProfileQueryKey,
  useUpsertDoctorProfile,
  useCompleteRoutingStep,
  useListRoutingSteps,
  getListRoutingStepsQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Save, CheckCircle2, Stethoscope, User, GraduationCap, Briefcase, Award, IdCard, Calendar } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

const GENDER_LABELS: Record<string, string> = {
  male: 'Мужской',
  female: 'Женский',
};

function formatBirthDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export default function DoctorProfilePage() {
  const params = useParams();
  const routingSheetId = Number(params.routingSheetId);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isChiefPhysician = user?.role === 'chief_physician' || user?.role === 'admin';
  const isAccountManager = user?.role === 'account_manager';

  // GET response shape changed: { profile, candidate, routingSheet }
  // We cast to any to access the new fields without regenerating the API client.
  const { data: resp, isLoading } = useGetDoctorProfile(routingSheetId, {
    query: { queryKey: getGetDoctorProfileQueryKey(routingSheetId), enabled: !!routingSheetId }
  }) as any;

  const profile = resp?.profile ?? null;
  const candidate = resp?.candidate ?? null;
  const sheetCtx = resp?.routingSheet ?? null;

  // Find the routing step for this sheet
  const { data: steps } = useListRoutingSteps(
    { routingSheetId, pending: false } as any,
    { query: { queryKey: getListRoutingStepsQueryKey({ routingSheetId }), enabled: !!routingSheetId } }
  );
  const doctorStep = steps?.find((s: any) => s.stepType === 'doctor_profile');
  const publicationStep = steps?.find((s: any) => s.stepType === 'site_publication');
  const isStepCompleted = isChiefPhysician ? doctorStep?.status === 'completed' : publicationStep?.status === 'completed';

  const upsertMutation = useUpsertDoctorProfile();
  const completeMutation = useCompleteRoutingStep();

  const [form, setForm] = useState({
    experience: '',
    specialty: '',
    ageRestrictions: '',
    siteDiscounts: '',
    about: '',
    proceduresRaw: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        experience: profile.experience != null ? String(profile.experience) : '',
        specialty: profile.specialty ?? '',
        ageRestrictions: profile.ageRestrictions ?? '',
        siteDiscounts: profile.siteDiscounts ?? '',
        about: profile.about ?? '',
        proceduresRaw: Array.isArray(profile.procedures) ? (profile.procedures as string[]).join('\n') : '',
      });
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await upsertMutation.mutateAsync({
        routingSheetId,
        data: {
          experience: form.experience ? Number(form.experience) : undefined,
          specialty: form.specialty || undefined,
          ageRestrictions: form.ageRestrictions || undefined,
          siteDiscounts: form.siteDiscounts || undefined,
          about: form.about || undefined,
          procedures: form.proceduresRaw
            ? form.proceduresRaw.split('\n').map(s => s.trim()).filter(Boolean)
            : undefined,
        }
      });
      await qc.invalidateQueries({ queryKey: getGetDoctorProfileQueryKey(routingSheetId) });
      toast({ title: 'Профиль сохранён' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось сохранить' });
    }
  };

  const handleCompleteStep = async () => {
    const stepId = isChiefPhysician ? doctorStep?.id : publicationStep?.id;
    if (!stepId) { toast({ variant: 'destructive', title: 'Ошибка', description: 'Шаг не найден' }); return; }

    completeMutation.mutate({ id: stepId, data: { notes: isChiefPhysician ? 'Профиль врача заполнен' : 'Опубликовано на сайтах' } }, {
      onSuccess: () => {
        toast({ title: isChiefPhysician ? 'Профиль заполнен!' : 'Опубликовано на сайтах!' });
        setLocation('/my-tasks');
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Ошибка завершения' });
      }
    });
  };

  if (isLoading) return (
    <AppLayout title="Профиль врача">
      <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </AppLayout>
  );

  return (
    <AppLayout title="Профиль врача">
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/my-tasks')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-blue-500" />
            <h1 className="text-xl font-bold">Профиль врача</h1>
          </div>
          {isStepCompleted && <Badge variant="default" className="gap-1 text-emerald-700 bg-emerald-100"><CheckCircle2 className="w-3 h-3" />Завершено</Badge>}
        </div>

        {/* ── Карточка кандидата: данные, которые ввёл рекрутер ──────────── */}
        {/* Chief physician и account manager видят их для контекста при       */}
        {/* заполнении профиля врача.                                          */}
        {candidate && (
          <Card className="border-blue-200/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                Данные кандидата
              </CardTitle>
              <CardDescription>
                Введены рекрутером. {isChiefPhysician ? 'Используйте как контекст при заполнении профиля врача.' : 'Информация для ознакомления перед публикацией.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ФИО + ИИН + пол + дата рождения */}
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">ФИО:</span>{' '}
                  <span className="font-medium">{candidate.fullName}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <IdCard className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">ИИН:</span>
                    <span className="font-mono">{candidate.iin}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Рождение:</span>
                    <span>{formatBirthDate(candidate.birthDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Пол:</span>
                    <span>{candidate.gender ? GENDER_LABELS[candidate.gender] ?? candidate.gender : '—'}</span>
                  </div>
                  {sheetCtx && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Должность:</span>
                      <span>{sheetCtx.positionName}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Профессиональные данные */}
              <div className="space-y-3">
                {candidate.education && (
                  <div className="flex items-start gap-2 text-sm">
                    <GraduationCap className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Образование</div>
                      <div className="whitespace-pre-wrap">{candidate.education}</div>
                    </div>
                  </div>
                )}
                {candidate.experience && (
                  <div className="flex items-start gap-2 text-sm">
                    <Briefcase className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Опыт работы</div>
                      <div className="whitespace-pre-wrap">{candidate.experience}</div>
                    </div>
                  </div>
                )}
                {candidate.certifications && (
                  <div className="flex items-start gap-2 text-sm">
                    <Award className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Сертификаты / курсы</div>
                      <div className="whitespace-pre-wrap">{candidate.certifications}</div>
                    </div>
                  </div>
                )}
                {!candidate.education && !candidate.experience && !candidate.certifications && (
                  <p className="text-sm text-muted-foreground italic">Рекрутер не заполнил профессиональные данные.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Профиль врача (заполняет главврач) ─────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isChiefPhysician ? 'Заполните профиль врача' : 'Профиль врача (просмотр)'}</CardTitle>
            <CardDescription>
              {isChiefPhysician
                ? 'Данные будут использованы для публикации на сайтах клиники'
                : 'Ознакомьтесь с профилем перед публикацией'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Стаж (лет)</Label>
                {isChiefPhysician ? (
                  <Input
                    type="number"
                    value={form.experience}
                    onChange={(e) => setForm({ ...form, experience: e.target.value })}
                    placeholder="10"
                    disabled={isStepCompleted}
                  />
                ) : <p className="text-sm font-medium py-2">{profile?.experience ?? '—'}</p>}
              </div>
              <div className="space-y-1">
                <Label>Специализация</Label>
                {isChiefPhysician ? (
                  <Input
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    placeholder="Кардиолог"
                    disabled={isStepCompleted}
                  />
                ) : <p className="text-sm font-medium py-2">{profile?.specialty ?? '—'}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Возрастные ограничения</Label>
                {isChiefPhysician ? (
                  <Input
                    value={form.ageRestrictions}
                    onChange={(e) => setForm({ ...form, ageRestrictions: e.target.value })}
                    placeholder="18+"
                    disabled={isStepCompleted}
                  />
                ) : <p className="text-sm font-medium py-2">{profile?.ageRestrictions ?? '—'}</p>}
              </div>
              <div className="space-y-1">
                <Label>Скидки на сайте</Label>
                {isChiefPhysician ? (
                  <Input
                    value={form.siteDiscounts}
                    onChange={(e) => setForm({ ...form, siteDiscounts: e.target.value })}
                    placeholder="10% пенсионерам"
                    disabled={isStepCompleted}
                  />
                ) : <p className="text-sm font-medium py-2">{profile?.siteDiscounts ?? '—'}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label>О враче</Label>
              {isChiefPhysician ? (
                <Textarea
                  value={form.about}
                  onChange={(e) => setForm({ ...form, about: e.target.value })}
                  placeholder="Краткое описание врача для сайта..."
                  rows={4}
                  disabled={isStepCompleted}
                />
              ) : <p className="text-sm font-medium py-2 whitespace-pre-wrap">{profile?.about ?? '—'}</p>}
            </div>

            <div className="space-y-1">
              <Label>Услуги / процедуры (каждая с новой строки)</Label>
              {isChiefPhysician ? (
                <Textarea
                  value={form.proceduresRaw}
                  onChange={(e) => setForm({ ...form, proceduresRaw: e.target.value })}
                  placeholder="ЭКГ&#10;УЗИ сердца&#10;Холтер"
                  rows={4}
                  disabled={isStepCompleted}
                />
              ) : (
                <div className="space-y-1 py-1">
                  {profile?.procedures && Array.isArray(profile.procedures) && (profile.procedures as string[]).length > 0
                    ? (profile.procedures as string[]).map((p, i) => (
                        <div key={i} className="text-sm py-0.5">• {p}</div>
                      ))
                    : <p className="text-sm text-muted-foreground">Не указаны</p>
                  }
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2">
              {isChiefPhysician && !isStepCompleted && (
                <>
                  <Button variant="outline" onClick={handleSave} disabled={upsertMutation.isPending}>
                    {upsertMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Сохранить профиль
                  </Button>
                  {profile && (
                    <Button onClick={handleCompleteStep} disabled={completeMutation.isPending}>
                      {completeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Профиль заполнен — завершить этап
                    </Button>
                  )}
                </>
              )}

              {isAccountManager && !isStepCompleted && profile && (
                <Button onClick={handleCompleteStep} disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Опубликовано на сайтах
                </Button>
              )}

              {isAccountManager && !profile && (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md">
                  Профиль врача ещё не заполнен главным врачом. Дождитесь заполнения профиля.
                </p>
              )}

              {isStepCompleted && (
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Этап завершён</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
