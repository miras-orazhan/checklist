import React from 'react';
import { useLocation } from 'wouter';
import { useGetMyTasks } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckSquare, Clock, ArrowRight, UserCircle, Briefcase, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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

export default function MyTasks() {
  const [, setLocation] = useLocation();
  const { data: tasks, isLoading } = useGetMyTasks();

  return (
    <AppLayout title="Входящие задачи">
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="text-center p-16 border border-dashed border-border rounded-xl bg-card">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 text-emerald-500">
            <CheckSquare className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-foreground">Нет активных задач</h3>
          <p className="text-sm text-muted-foreground mt-1">Отличная работа! Все задачи выполнены.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2 px-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Требуют внимания ({tasks.length})
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tasks.map(task => (
              <Card key={task.id} className="hover-elevate transition-all border-border shadow-sm flex flex-col group cursor-pointer" onClick={() => setLocation(`/my-tasks/${task.id}`)}>
                <CardContent className="p-5 flex flex-col h-full relative overflow-hidden">
                  {/* Status strip */}
                  <div className={`absolute top-0 left-0 w-1 h-full ${task.status === 'in_progress' ? 'bg-amber-500' : 'bg-primary'}`} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant={task.status === 'in_progress' ? 'default' : 'secondary'} className={task.status === 'in_progress' ? 'bg-amber-500 text-white hover:bg-amber-600' : ''}>
                      {STEP_LABELS[task.stepType] || task.stepType}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(task.createdAt), 'dd MMM', { locale: ru })}
                    </span>
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start gap-2">
                      <UserCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{task.candidateName}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <Briefcase className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="text-sm text-muted-foreground">{task.positionName}</div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="text-sm text-muted-foreground">{task.branchName}</div>
                    </div>
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-border flex justify-between items-center group-hover:border-primary/20 transition-colors">
                    <span className="text-xs font-medium text-primary">Перейти к выполнению</span>
                    <ArrowRight className="w-4 h-4 text-primary transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
