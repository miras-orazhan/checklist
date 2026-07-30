import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCreateCandidate } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, CalendarDays, UserCircle, AlertCircle } from 'lucide-react';

// ─── IIN validation + parsing (Kazakhstan format, 12 digits) ────────────────
// Mirrors the server-side parseIin() — used for live preview + early rejection.
const WEIGHTS_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEIGHTS_2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

function computeCheckDigit(first11: string): number | null {
  const digits = first11.split('').map(Number);
  const sum1 = digits.reduce((acc, d, i) => acc + d * WEIGHTS_1[i], 0);
  const mod1 = sum1 % 11;
  if (mod1 === 10) {
    const sum2 = digits.reduce((acc, d, i) => acc + d * WEIGHTS_2[i], 0);
    const mod2 = sum2 % 11;
    if (mod2 === 10) return null;
    return mod2;
  }
  return mod1;
}

interface ParsedIin {
  birthDate: Date | null;
  gender: 'male' | 'female' | null;
  valid: boolean;
  error?: string;
}

function parseIin(input: string): ParsedIin {
  const iin = input.trim();
  if (!iin) return { birthDate: null, gender: null, valid: false };
  if (!/^\d{12}$/.test(iin)) {
    return { birthDate: null, gender: null, valid: false, error: 'ИИН должен состоять из 12 цифр' };
  }
  const centuryGenderDigit = Number(iin[6]);
  if (centuryGenderDigit < 1 || centuryGenderDigit > 6) {
    return { birthDate: null, gender: null, valid: false, error: 'Неверный 7-й разряд ИИН' };
  }
  const gender: 'male' | 'female' = centuryGenderDigit % 2 === 1 ? 'male' : 'female';
  const centuryBase =
    centuryGenderDigit <= 2 ? 1800 :
    centuryGenderDigit <= 4 ? 1900 : 2000;
  const yy = Number(iin.slice(0, 2));
  const mm = Number(iin.slice(2, 4));
  const dd = Number(iin.slice(4, 6));
  const year = centuryBase + yy;
  const birthDate = new Date(Date.UTC(year, mm - 1, dd));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== mm - 1 ||
    birthDate.getUTCDate() !== dd
  ) {
    return { birthDate: null, gender, valid: false, error: 'ИИН содержит несуществующую дату' };
  }
  if (birthDate.getTime() > Date.now()) {
    return { birthDate, gender, valid: false, error: 'Дата рождения из ИИН — в будущем' };
  }
  const expected = computeCheckDigit(iin.slice(0, 11));
  if (expected === null || Number(iin[11]) !== expected) {
    return { birthDate, gender, valid: false, error: 'Контрольный разряд ИИН неверен' };
  }
  return { birthDate, gender, valid: true };
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

const GENDER_LABELS: Record<string, string> = { male: 'Мужской', female: 'Женский' };

// ─── Form schema ────────────────────────────────────────────────────────────
const candidateSchema = z.object({
  lastName: z.string().min(2, 'Введите фамилию'),
  firstName: z.string().min(2, 'Введите имя'),
  middleName: z.string().optional(),
  email: z.string().email('Некорректный email'),
  phone: z.string().min(10, 'Введите телефон'),
  iin: z.string()
    .length(12, 'ИИН должен быть 12 цифр')
    .regex(/^\d{12}$/, 'ИИН должен содержать только цифры'),
  experience: z.string().optional(),
  education: z.string().optional(),
  certifications: z.string().optional(),
}).refine((data) => parseIin(data.iin).valid, {
  message: 'Проверьте корректность ИИН — дата рождения/пол/контрольный разряд',
  path: ['iin'],
});

type FormValues = z.infer<typeof candidateSchema>;

export default function NewCandidate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      lastName: '',
      firstName: '',
      middleName: '',
      email: '',
      phone: '',
      iin: '',
      experience: '',
      education: '',
      certifications: '',
    },
    mode: 'onChange',
  });

  const createMutation = useCreateCandidate();

  // Live IIN preview — show the candidate's derived birth date + gender
  // before they submit, so they can verify the IIN is correct.
  const iinValue = form.watch('iin');
  const iinPreview = useMemo(() => parseIin(iinValue), [iinValue]);

  const onSubmit = (values: FormValues) => {
    // Build payload — match the new CandidateInput schema (no fullName field)
    const payload = {
      lastName: values.lastName,
      firstName: values.firstName,
      middleName: values.middleName || undefined,
      email: values.email,
      phone: values.phone,
      iin: values.iin,
      experience: values.experience || undefined,
      education: values.education || undefined,
      certifications: values.certifications || undefined,
    };

    createMutation.mutate(
      { data: payload as any },
      {
        onSuccess: (candidate) => {
          toast({
            title: 'Кандидат добавлен',
            description: `${candidate.fullName} — теперь можно сформировать оффер.`,
          });
          setLocation(`/candidates/${candidate.id}`);
        },
        onError: (error: any) => {
          toast({
            variant: 'destructive',
            title: 'Ошибка',
            description: error?.data?.error || 'Не удалось создать кандидата',
          });
        },
      }
    );
  };

  return (
    <AppLayout
      title="Новый кандидат"
      actions={
        <Button variant="outline" size="sm" onClick={() => setLocation('/candidates')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>
      }
    >
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Информация о кандидате</CardTitle>
            <CardDescription>
              Заполняется рекрутером. ФИО и ИИН обязательны — дата рождения и пол
              определяются автоматически из ИИН.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* ── ФИО (раздельно) ─────────────────────────────────── */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <UserCircle className="w-4 h-4 text-primary" />
                    ФИО
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Фамилия <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Иванов" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Имя <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Иван" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="middleName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Отчество</FormLabel>
                          <FormControl>
                            <Input placeholder="Иванович" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* ── Контактные данные ──────────────────────────────── */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground">Контактные данные</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="ivanov@example.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Телефон <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="+7 (999) 000-00-00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* ── ИИН + авто-вывод даты рождения / пола ─────────── */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    ИИН и данные о рождении
                  </h3>
                  <FormField
                    control={form.control}
                    name="iin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ИИН <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123456789012"
                            maxLength={12}
                            inputMode="numeric"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-[0.8rem] text-muted-foreground">
                          12 цифр. Дата рождения и пол определяются автоматически из ИИН.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Live preview: birth date + gender derived from IIN */}
                  {iinValue.length > 0 && (
                    <div className="grid grid-cols-2 gap-4 bg-muted/30 border rounded-lg p-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Дата рождения</p>
                        <p className={`text-sm font-medium ${iinPreview.birthDate ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {formatDate(iinPreview.birthDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Пол</p>
                        <p className={`text-sm font-medium ${iinPreview.gender ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {iinPreview.gender ? GENDER_LABELS[iinPreview.gender] : '—'}
                        </p>
                      </div>
                      {iinValue.length === 12 && !iinPreview.valid && iinPreview.error && (
                        <div className="col-span-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-500 mt-1">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{iinPreview.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Опыт / образование / курсы ─────────────────────── */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground">Профессиональные данные</h3>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Видят главный врач и аккаунт-менеджер при заполнении профиля.
                  </p>
                  <FormField
                    control={form.control}
                    name="education"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Образование</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="ВУЗ, специальность, год выпуска; ординатура; курсы повышения квалификации"
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Опыт работы</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Где работал, какой стаж, ключевые обязанности"
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="certifications"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Сертификаты / курсы</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Сертификаты, лицензии, пройденные курсы"
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end pt-6 border-t border-border">
                  <Button type="button" variant="ghost" onClick={() => setLocation('/candidates')} className="mr-2">
                    Отмена
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Создать кандидата
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
