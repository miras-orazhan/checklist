import React from 'react';
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
import { Loader2, ArrowLeft } from 'lucide-react';

const candidateSchema = z.object({
  fullName: z.string().min(2, 'Введите полное имя'),
  email: z.string().email('Некорректный email'),
  phone: z.string().min(10, 'Введите телефон'),
  experience: z.string().optional(),
  education: z.string().optional(),
  certifications: z.string().optional(),
});

export default function NewCandidate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof candidateSchema>>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      experience: '',
      education: '',
      certifications: '',
    },
  });

  const createMutation = useCreateCandidate();

  const onSubmit = (values: z.infer<typeof candidateSchema>) => {
    createMutation.mutate(
      { data: values },
      {
        onSuccess: (candidate) => {
          toast({
            title: 'Кандидат добавлен',
            description: 'Теперь вы можете сформировать оффер.',
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
            <CardDescription>Заполните основные данные для подготовки оффера</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ФИО</FormLabel>
                        <FormControl>
                          <Input placeholder="Иванов Иван Иванович" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
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
                          <FormLabel>Телефон</FormLabel>
                          <FormControl>
                            <Input placeholder="+7 (999) 000-00-00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-foreground">Дополнительная информация (опционально)</h3>
                  <FormField
                    control={form.control}
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Опыт работы</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Краткое описание опыта..." className="resize-none" rows={3} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="education"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Образование</FormLabel>
                        <FormControl>
                          <Input placeholder="ВУЗ, специальность, год выпуска" {...field} />
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
                        <FormLabel>Сертификаты / Навыки</FormLabel>
                        <FormControl>
                          <Input placeholder="Сертификаты, курсы, лицензии" {...field} />
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
