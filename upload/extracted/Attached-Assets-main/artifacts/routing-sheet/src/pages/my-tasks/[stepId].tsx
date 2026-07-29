import React, { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetRoutingStep, getGetRoutingStepQueryKey, useCompleteRoutingStep, useRequestUploadUrl, useListBranches, getListBranchesQueryKey, useListPositions, getListPositionsQueryKey } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, ArrowLeft, CheckCircle2, UploadCloud, FileImage, Image as ImageIcon } from 'lucide-react';

const STEP_LABELS: Record<string, string> = {
  hr_registration: 'Оформление',
  marketing_photo: 'Фотография',
  tb_briefing: 'Инструктаж ТБ',
  it_accounts: 'Учетные записи',
  audit_training: 'Обучение',
  doctor_profile: 'Профиль врача',
  site_publication: 'Публикация на сайте',
  final_review: 'Финальная проверка',
};

// Flat schema with all fields optional; required validation done in onSubmit
const stepFormSchema = z.object({
  notes: z.string().optional(),
  branchId: z.coerce.number().optional(),
  positionId: z.coerce.number().optional(),
});
type StepFormValues = z.infer<typeof stepFormSchema>;

export default function TaskDetail() {
  const params = useParams();
  const stepId = parseInt(params.stepId || '0', 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: step, isLoading } = useGetRoutingStep(stepId, { query: { queryKey: getGetRoutingStepQueryKey(stepId), enabled: !!stepId } });

  // Doctor profile & site publication steps go to dedicated page
  React.useEffect(() => {
    if (step && (step.stepType === 'doctor_profile' || step.stepType === 'site_publication')) {
      setLocation(`/doctor-profile/${step.routingSheetId}`);
    }
  }, [step, setLocation]);
  const completeMutation = useCompleteRoutingStep();
  const requestUpload = useRequestUploadUrl();

  // Data for HR registration step
  const isHrStep = step?.stepType === 'hr_registration';
  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey(), enabled: isHrStep }});
  const { data: positions } = useListPositions({ query: { queryKey: getListPositionsQueryKey(), enabled: isHrStep }});

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<StepFormValues>({
    resolver: zodResolver(stepFormSchema),
    defaultValues: { notes: '', branchId: undefined, positionId: undefined },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
    }
  };

  const onSubmit = async (values: any) => {
    let finalPhotoUrl = photoUrl;

    // Handle photo upload if needed (marketing_photo step)
    if (step?.stepType === 'marketing_photo' && photoFile && !finalPhotoUrl) {
      try {
        setIsUploading(true);
        // 1. Get presigned URL
        const uploadInfo = await requestUpload.mutateAsync({
          data: {
            name: photoFile.name,
            size: photoFile.size,
            contentType: photoFile.type
          }
        });
        
        // 2. PUT directly to S3
        await fetch(uploadInfo.uploadURL, {
          method: 'PUT',
          body: photoFile,
          headers: { 'Content-Type': photoFile.type }
        });

        // 3. Save object path
        finalPhotoUrl = uploadInfo.objectPath;
      } catch (err: any) {
        setIsUploading(false);
        toast({ variant: 'destructive', title: 'Ошибка загрузки', description: 'Не удалось загрузить фото' });
        return;
      } finally {
        setIsUploading(false);
      }
    }

    if (step?.stepType === 'marketing_photo' && !finalPhotoUrl) {
      toast({ variant: 'destructive', title: 'Внимание', description: 'Загрузка фото обязательна для этого этапа' });
      return;
    }

    const payload: any = {
      notes: values.notes || 'Выполнено без примечаний',
    };

    if (values.branchId) payload.branchId = values.branchId;
    if (values.positionId) payload.positionId = values.positionId;
    if (finalPhotoUrl) payload.photoUrl = finalPhotoUrl;

    completeMutation.mutate(
      { id: stepId, data: payload },
      {
        onSuccess: () => {
          toast({ title: 'Задача выполнена!' });
          setLocation('/my-tasks');
        },
        onError: (err: any) => {
          toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось выполнить задачу' });
        }
      }
    );
  };

  if (isLoading) {
    return <AppLayout title="Задача"><div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  if (!step) {
    return <AppLayout title="Задача"><div className="p-8 text-center text-muted-foreground">Задача не найдена</div></AppLayout>;
  }

  const isCompleted = step.status === 'completed' || step.status === 'skipped';

  return (
    <AppLayout 
      title={`Задача: ${STEP_LABELS[step.stepType] || step.stepType}`}
      actions={
        <Button variant="outline" size="sm" onClick={() => setLocation('/my-tasks')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Входящие
        </Button>
      }
    >
      <div className="max-w-2xl mx-auto">
        {isCompleted && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
            <div>
              <div className="font-semibold">Задача уже выполнена</div>
              <div className="text-sm opacity-90">Вы не можете редактировать завершенную задачу.</div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Выполнение этапа</CardTitle>
            <CardDescription>Заполните необходимые данные для подтверждения выполнения</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Specific Fields by Step Type */}
                {step.stepType === 'hr_registration' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg border border-border">
                    <FormField
                      control={form.control}
                      name="branchId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Филиал прикрепления</FormLabel>
                          <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString() || ""} disabled={isCompleted}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите филиал" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {branches?.map(b => (
                                <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="positionId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Должность</FormLabel>
                          <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString() || ""} disabled={isCompleted}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите должность" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {positions?.map(p => (
                                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step.stepType === 'marketing_photo' && !isCompleted && (
                  <div className="bg-muted/20 p-6 rounded-lg border border-border flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      {photoFile ? <FileImage className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
                    </div>
                    <div>
                      <h4 className="font-medium">Загрузка фотографии</h4>
                      <p className="text-sm text-muted-foreground mt-1">Официальное фото для сайта и пропуска</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input id="picture" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="max-w-xs" />
                    </div>
                  </div>
                )}
                {step.stepType === 'marketing_photo' && isCompleted && step.photoUrl && (
                  <div className="bg-muted/20 p-4 rounded-lg border border-border">
                    <p className="text-sm font-medium mb-2">Загруженное фото:</p>
                    <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center border border-border overflow-hidden">
                      <img src={step.photoUrl} alt="Фото кандидата" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Комментарий / Примечание</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Укажите результаты, выданные доступы или другую важную информацию..." 
                          className="min-h-[100px] resize-none" 
                          {...field}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isCompleted && (
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={completeMutation.isPending || isUploading}>
                      {(completeMutation.isPending || isUploading) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      {isUploading ? 'Загрузка...' : 'Завершить этап'}
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
