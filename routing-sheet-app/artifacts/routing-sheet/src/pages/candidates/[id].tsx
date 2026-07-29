import React, { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { 
  useGetCandidate,
  getGetCandidateQueryKey,
  useCreateOffer,
  useListBranches,
  getListBranchesQueryKey,
  useListPositions,
  getListPositionsQueryKey,
  useCloseRoutingSheet,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Link as LinkIcon, CheckCircle2, Clock, XCircle, ArrowRight, User, Briefcase, Phone, Mail as MailIcon, Award, UserCheck, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  accepted: 'Принят',
  expired: 'Истек',
};

const STEP_LABELS: Record<string, string> = {
  hr_registration: 'Оформление (HR)',
  marketing_photo: 'Фото (Маркетинг)',
  tb_briefing: 'Инструктаж ТБ',
  it_accounts: 'Учетные записи (IT)',
  audit_training: 'Обучение (Аудит)',
  doctor_profile: 'Профиль врача',
  site_publication: 'Публикация на сайте',
  final_review: 'Финальная проверка',
};

export default function CandidateDetail() {
  const params = useParams();
  const id = parseInt(params.id || '0', 10);
  const { toast } = useToast();
  
  const { data: candidate, isLoading, refetch } = useGetCandidate(id, {
    query: { queryKey: getGetCandidateQueryKey(id), enabled: !!id }
  });

  const createOffer = useCreateOffer();
  const closeSheet = useCloseRoutingSheet();
  const [closeNotes, setCloseNotes] = useState('');
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isOfferDialogOpen, setIsOfferDialogOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');

  const { data: branches } = useListBranches({ query: { queryKey: getListBranchesQueryKey(), enabled: isOfferDialogOpen } });
  const { data: positions } = useListPositions({ query: { queryKey: getListPositionsQueryKey(), enabled: isOfferDialogOpen } });

  const handleSendOffer = () => {
    if (!selectedBranchId || !selectedPositionId) {
      toast({ variant: 'destructive', title: 'Необходимо выбрать филиал и должность' });
      return;
    }
    createOffer.mutate({
      data: {
        candidateId: id,
        branchId: Number(selectedBranchId),
        positionId: Number(selectedPositionId),
        message: "Приглашаем вас присоединиться к нашей команде!",
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Оффер создан и отправлен кандидату' });
        setIsOfferDialogOpen(false);
        refetch();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось отправить оффер' });
      }
    });
  };

  const handleCloseSheet = () => {
    if (!candidate?.routingSheet) return;
    closeSheet.mutate({ id: candidate.routingSheet.id, data: { notes: closeNotes } }, {
      onSuccess: () => {
        toast({ title: 'Обходной лист закрыт/отменен' });
        setIsCloseDialogOpen(false);
        refetch();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось закрыть лист' });
      }
    });
  };

  if (isLoading) {
    return (
      <AppLayout title="Карточка кандидата">
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!candidate) {
    return (
      <AppLayout title="Карточка кандидата">
        <div className="p-8 text-center text-muted-foreground">Кандидат не найден</div>
      </AppLayout>
    );
  }

  const { routingSheet } = candidate;

  return (
    <AppLayout title={`Кандидат: ${candidate.fullName}`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Candidate Info & Offer */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Личные данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <MailIcon className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Email</div>
                  <div className="text-sm text-muted-foreground">{candidate.email}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 mt-1 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Телефон</div>
                  <div className="text-sm text-muted-foreground">{candidate.phone}</div>
                </div>
              </div>
              {candidate.experience && (
                <div className="flex items-start gap-3">
                  <Briefcase className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Опыт работы</div>
                    <div className="text-sm text-muted-foreground">{candidate.experience}</div>
                  </div>
                </div>
              )}
              {candidate.education && (
                <div className="flex items-start gap-3">
                  <Award className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Образование</div>
                    <div className="text-sm text-muted-foreground">{candidate.education}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Статус оффера</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Badge variant={candidate.offerStatus === 'accepted' ? 'default' : 'secondary'} className="text-sm">
                  {STATUS_LABELS[candidate.offerStatus] || candidate.offerStatus}
                </Badge>
              </div>
              
              {candidate.offerStatus === 'draft' && (
                <Button className="w-full" onClick={() => setIsOfferDialogOpen(true)}>
                  <Mail className="w-4 h-4 mr-2" />
                  Сформировать и отправить оффер
                </Button>
              )}

              {candidate.offerStatus === 'sent' && (
                <div className="text-sm text-muted-foreground flex items-center gap-2 p-3 bg-muted/30 rounded-md border border-border">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Ожидаем подтверждения от кандидата
                </div>
              )}

              {candidate.offerStatus === 'accepted' && (
                <div className="text-sm text-muted-foreground flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-md border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                  Оффер принят
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Routing Sheet Progress */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row justify-between items-start pb-2 border-b border-border">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-primary" />
                  Обходной лист
                </CardTitle>
                <CardDescription className="mt-1">
                  {routingSheet 
                    ? `${routingSheet.positionName} • ${routingSheet.branchName}`
                    : 'Формируется после принятия оффера'}
                </CardDescription>
              </div>
              {routingSheet && routingSheet.status === 'in_progress' && (
                <Button variant="outline" size="sm" onClick={() => setIsCloseDialogOpen(true)} className="text-destructive hover:bg-destructive hover:text-destructive-foreground">
                  <XCircle className="w-4 h-4 mr-2" />
                  Остановить процесс
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-6 flex-1">
              {!routingSheet ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Clock className="w-8 h-8 opacity-50" />
                  </div>
                  <p>Обходной лист будет создан автоматически, когда кандидат примет оффер.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {routingSheet.status === 'completed' && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">Процесс завершен</div>
                        <div className="text-sm opacity-90">Кандидат успешно прошел все этапы обходного листа.</div>
                      </div>
                    </div>
                  )}
                  {routingSheet.status === 'cancelled' && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3 text-destructive">
                      <ShieldAlert className="w-6 h-6 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">Процесс отменен</div>
                        <div className="text-sm opacity-90">Обходной лист был остановлен.</div>
                      </div>
                    </div>
                  )}

                  <div className="relative pl-6 border-l-2 border-muted space-y-8 mt-4">
                    {routingSheet.steps.map((step, idx) => {
                      const isCompleted = step.status === 'completed' || step.status === 'skipped';
                      const isInProgress = step.status === 'in_progress';
                      const isPending = step.status === 'pending';
                      
                      return (
                        <div key={step.id} className="relative">
                          {/* Traffic light timeline dot */}
                          <div className={`absolute -left-[35px] w-6 h-6 rounded-full border-4 border-card flex items-center justify-center
                            ${isCompleted ? 'bg-emerald-500' : isInProgress ? 'bg-amber-500' : 'bg-muted-foreground/30'}
                          `}>
                            {isCompleted && <CheckCircle2 className="w-3 h-3 text-white" />}
                            {isInProgress && <Loader2 className="w-3 h-3 text-white animate-spin" />}
                          </div>
                          
                          <div className={`p-4 border rounded-lg transition-colors
                            ${isInProgress ? 'bg-card border-amber-500/50 shadow-sm shadow-amber-500/5' : 'bg-card border-border'}
                            ${isCompleted ? 'opacity-80' : ''}
                          `}>
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-medium text-sm flex items-center gap-2">
                                  {STEP_LABELS[step.stepType] || step.stepType}
                                  {step.isBackground && <Badge variant="secondary" className="text-[10px] py-0 h-4">Фоновый</Badge>}
                                </h4>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Ответственный: {step.assignedRole}
                                </div>
                              </div>
                              <Badge variant={isCompleted ? 'outline' : isInProgress ? 'default' : 'secondary'} className="text-xs">
                                {isCompleted ? 'Готово' : isInProgress ? 'В работе' : 'Ожидание'}
                              </Badge>
                            </div>
                            
                            {step.notes && (
                              <div className="mt-3 text-sm bg-muted/30 p-3 rounded text-foreground border border-border/50">
                                <span className="font-medium text-muted-foreground mr-2">Примечание:</span>
                                {step.notes}
                              </div>
                            )}
                            
                            {isCompleted && step.completedByName && (
                              <div className="mt-3 text-xs text-muted-foreground flex justify-between items-center border-t border-border/50 pt-2">
                                <span>Выполнил: {step.completedByName}</span>
                                {step.completedAt && <span>{format(new Date(step.completedAt), 'dd.MM HH:mm')}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send Offer Dialog */}
      <Dialog open={isOfferDialogOpen} onOpenChange={setIsOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить оффер кандидату</DialogTitle>
            <DialogDescription>
              Выберите филиал и должность для создания обходного листа.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Филиал</Label>
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите филиал..." />
                </SelectTrigger>
                <SelectContent>
                  {branches?.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Должность</Label>
              <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите должность..." />
                </SelectTrigger>
                <SelectContent>
                  {positions?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOfferDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSendOffer} disabled={createOffer.isPending || !selectedBranchId || !selectedPositionId}>
              {createOffer.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Отправить оффер
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Остановить обходной лист?</DialogTitle>
            <DialogDescription>
              Это действие необратимо. Текущий процесс будет прерван, задачи будут сняты.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Причина отмены</label>
              <Textarea 
                placeholder="Например: Кандидат перестал выходить на связь..." 
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleCloseSheet} disabled={closeSheet.isPending || !closeNotes.trim()}>
              {closeSheet.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Подтвердить отмену
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
