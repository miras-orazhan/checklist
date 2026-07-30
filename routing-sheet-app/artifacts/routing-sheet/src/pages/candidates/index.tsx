import React, { useState, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Search, UserPlus, FileText, Download, Upload, User as UserIcon, Save, X, IdCard, GraduationCap, Briefcase, Award, Mail, Phone, Calendar, Stethoscope } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { compressPhoto } from '@/lib/photoUpload';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Candidate {
  id: number;
  lastName: string;
  firstName: string;
  middleName?: string | null;
  fullName: string;
  email: string;
  phone: string;
  iin: string;
  birthDate?: string | null;
  gender?: string | null;
  experience?: string | null;
  education?: string | null;
  certifications?: string | null;
  offerStatus: string;
  createdById?: number;
  createdAt: Date;
  routingSheet?: {
    id: number;
    branchId: number;
    branchName?: string;
    positionId: number;
    positionName?: string;
    isDoctor: boolean;
    status: string;
    statusToken?: string;
  } | null;
}

interface Branch { id: number; name: string; }
interface Position { id: number; name: string; isDoctor: boolean; }

const GENDER_LABELS: Record<string, string> = { male: 'М', female: 'Ж' };

function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Edit dialog ─────────────────────────────────────────────────────────────
interface EditDialogProps {
  candidate: Candidate;
  branches: Branch[];
  positions: Position[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function EditCandidateDialog({ candidate, branches, positions, open, onOpenChange, onSaved }: EditDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = user?.role ?? '';
  const isRecruiter = role === 'recruiter' || role === 'admin';
  const isHr = role === 'hr' || role === 'admin';
  const isMarketing = role === 'marketing' || role === 'admin' || role === 'account_manager' || role === 'chief_physician';
  const isChiefOrAdmin = role === 'chief_physician' || role === 'admin';
  const isAccountManager = role === 'account_manager' || role === 'admin';

  const isDoctor = candidate.routingSheet?.isDoctor ?? false;

  // Candidate fields (recruiter)
  const [education, setEducation] = useState(candidate.education ?? '');
  const [experience, setExperience] = useState(candidate.experience ?? '');
  const [certifications, setCertifications] = useState(candidate.certifications ?? '');
  const [email, setEmail] = useState(candidate.email);
  const [phone, setPhone] = useState(candidate.phone);

  // Routing sheet fields (HR)
  const [branchId, setBranchId] = useState(String(candidate.routingSheet?.branchId ?? ''));
  const [positionId, setPositionId] = useState(String(candidate.routingSheet?.positionId ?? ''));

  // Photo
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Doctor profile fields (chief physician / account manager)
  const [specialty, setSpecialty] = useState('');
  const [about, setAbout] = useState('');
  const [procedures, setProcedures] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [ageRestrictions, setAgeRestrictions] = useState('');
  const [siteDiscounts, setSiteDiscounts] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setEducation(candidate.education ?? '');
      setExperience(candidate.experience ?? '');
      setCertifications(candidate.certifications ?? '');
      setEmail(candidate.email);
      setPhone(candidate.phone);
      setBranchId(String(candidate.routingSheet?.branchId ?? ''));
      setPositionId(String(candidate.routingSheet?.positionId ?? ''));
      setPhotoUrl(null);
      // Load photo + doctor profile
      (async () => {
        try {
          const token = localStorage.getItem('auth_token');
          // Get routing steps to find marketing photo
          const steps = await customFetch<any[]>(`/api/routing-steps?routingSheetId=${candidate.routingSheet?.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const marketingStep = steps?.find((s: any) => s.stepType === 'marketing_photo');
          setPhotoUrl(marketingStep?.photoUrl ?? null);

          // If doctor, load doctor profile
          if (isDoctor && candidate.routingSheet) {
            const resp = await customFetch<any>(`/api/doctor-profiles/${candidate.routingSheet.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const profile = resp?.profile;
            if (profile) {
              setSpecialty(profile.specialty ?? '');
              setAbout(profile.about ?? '');
              setProcedures(Array.isArray(profile.procedures) ? profile.procedures.join('\n') : '');
              setYearsExperience(profile.experience != null ? String(profile.experience) : '');
              setAgeRestrictions(profile.ageRestrictions ?? '');
              setSiteDiscounts(profile.siteDiscounts ?? '');
            }
          }
        } catch { /* ignore */ }
      })();
    }
  }, [open, candidate, isDoctor]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      const compressed = await compressPhoto(file);
      const token = localStorage.getItem('auth_token');
      const resp = await fetch(`/api/candidates/${candidate.id}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': compressed.type, Authorization: `Bearer ${token}` },
        body: compressed,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setPhotoUrl(data.url);
      toast({ title: 'Фото обновлено' });
      qc.invalidateQueries({ queryKey: ['candidates'] });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Ошибка', description: err?.message || 'Не удалось загрузить' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const promises: Promise<unknown>[] = [];

      // 1. Update candidate fields (recruiter)
      if (isRecruiter) {
        promises.push(
          customFetch(`/api/candidates/${candidate.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ education, experience, certifications, email, phone }),
          })
        );
      }

      // 2. Update routing sheet branch/position (HR)
      if (isHr && candidate.routingSheet && (branchId || positionId)) {
        const body: Record<string, unknown> = {};
        if (branchId) body.branchId = Number(branchId);
        if (positionId) body.positionId = Number(positionId);
        promises.push(
          customFetch(`/api/candidates/${candidate.id}/routing-sheet`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          })
        );
      }

      // 3. Update doctor profile (chief physician / account manager)
      if (isDoctor && candidate.routingSheet && (isChiefOrAdmin || isAccountManager)) {
        const body: Record<string, unknown> = {};
        if (isChiefOrAdmin || isAccountManager) {
          body.specialty = specialty || null;
          body.about = about || null;
          body.procedures = procedures ? procedures.split('\n').map((s) => s.trim()).filter(Boolean) : null;
          body.siteDiscounts = siteDiscounts || null;
        }
        if (isChiefOrAdmin) {
          body.ageRestrictions = ageRestrictions || null;
          body.experience = yearsExperience ? Number(yearsExperience) : null;
        }
        if (Object.keys(body).length > 0) {
          promises.push(
            customFetch(`/api/doctors/${candidate.routingSheet.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(body),
            })
          );
        }
      }

      await Promise.all(promises);
      toast({ title: 'Сохранено' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Ошибка', description: err?.message || 'Не удалось сохранить' });
    } finally {
      setIsSaving(false);
    }
  };

  const canEditSomething = isRecruiter || isHr || isMarketing || (isDoctor && (isChiefOrAdmin || isAccountManager));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDoctor && <Stethoscope className="w-5 h-5 text-blue-500" />}
            {candidate.fullName}
          </DialogTitle>
          <DialogDescription>
            {candidate.routingSheet?.positionName} • {candidate.routingSheet?.branchName}
            {isDoctor && ' • Врач'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Photo section (marketing, account_manager, chief_physician, admin) ── */}
          {isMarketing && (
            <div className="bg-muted/30 p-4 rounded-lg border">
              <Label className="text-sm font-medium mb-3 block">Фото</Label>
              <div className="flex items-start gap-4">
                <div className="w-28 h-28 rounded-lg bg-muted flex items-center justify-center border overflow-hidden flex-shrink-0 relative">
                  {isUploading && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  )}
                  {photoUrl ? (
                    <img src={photoUrl} alt={candidate.fullName} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-10 h-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} className="hidden" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isSaving}>
                      <Upload className="w-4 h-4 mr-1" />
                      {photoUrl ? 'Заменить' : 'Загрузить'}
                    </Button>
                    {photoUrl && (
                      <Button variant="ghost" size="sm" type="button" onClick={() => {
                        const a = document.createElement('a');
                        a.href = photoUrl + '?download=1';
                        a.download = `${candidate.lastName}.jpg`;
                        a.click();
                      }}>
                        <Download className="w-4 h-4 mr-1" />
                        Скачать
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Автосжатие до 1024×1024 px</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Read-only candidate info ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <IdCard className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">ИИН:</span>
              <span className="font-mono">{candidate.iin}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Рождение:</span>
              <span>{formatDate(candidate.birthDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Пол:</span>
              <span>{candidate.gender ? GENDER_LABELS[candidate.gender] ?? candidate.gender : '—'}</span>
            </div>
          </div>

          {/* ── Recruiter fields ─────────────────────────────────────────── */}
          {isRecruiter && (
            <div className="space-y-4 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> Профессиональные данные (рекрутер)
              </p>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Образование</Label>
                <Textarea value={education} onChange={(e) => setEducation(e.target.value)} placeholder="ВУЗ, специальность, год выпуска" rows={2} className="resize-none" disabled={isSaving} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Briefcase className="w-3 h-3" /> Опыт работы</Label>
                <Textarea value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="Где работал, стаж, обязанности" rows={2} className="resize-none" disabled={isSaving} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Award className="w-3 h-3" /> Сертификаты / курсы</Label>
                <Textarea value={certifications} onChange={(e) => setCertifications(e.target.value)} placeholder="Сертификаты, лицензии, курсы" rows={2} className="resize-none" disabled={isSaving} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSaving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" /> Телефон</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSaving} />
                </div>
              </div>
            </div>
          )}

          {/* ── HR fields (branch + position) ────────────────────────────── */}
          {isHr && candidate.routingSheet && (
            <div className="space-y-4 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Филиал и должность (HR)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Филиал</Label>
                  <Select value={branchId} onValueChange={setBranchId} disabled={isSaving}>
                    <SelectTrigger><SelectValue placeholder="Филиал" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Должность</Label>
                  <Select value={positionId} onValueChange={setPositionId} disabled={isSaving}>
                    <SelectTrigger><SelectValue placeholder="Должность" /></SelectTrigger>
                    <SelectContent>
                      {positions.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.isDoctor ? ' (врач)' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ── Doctor profile fields (chief physician / account manager) ── */}
          {isDoctor && candidate.routingSheet && (isChiefOrAdmin || isAccountManager) && (
            <div className="space-y-4 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Stethoscope className="w-3 h-3" /> Профиль врача
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Специализация</Label>
                  <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Кардиолог" disabled={isSaving} />
                </div>
                {isChiefOrAdmin && (
                  <div className="space-y-1">
                    <Label className="text-xs">Стаж (лет)</Label>
                    <Input type="number" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} placeholder="10" disabled={isSaving} />
                  </div>
                )}
              </div>
              {isChiefOrAdmin && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Возрастные ограничения</Label>
                    <Input value={ageRestrictions} onChange={(e) => setAgeRestrictions(e.target.value)} placeholder="18+" disabled={isSaving} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Скидки на сайте</Label>
                    <Input value={siteDiscounts} onChange={(e) => setSiteDiscounts(e.target.value)} placeholder="10% пенсионерам" disabled={isSaving} />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">О враче</Label>
                <Textarea value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Описание для сайта" rows={2} className="resize-none" disabled={isSaving} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Процедуры (по одной на строку)</Label>
                <Textarea value={procedures} onChange={(e) => setProcedures(e.target.value)} placeholder="ЭКГ&#10;УЗИ" rows={2} className="resize-none" disabled={isSaving} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            <X className="w-4 h-4 mr-1" /> Закрыть
          </Button>
          {canEditSomething && (
            <Button onClick={handleSave} disabled={isSaving || isUploading}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Сохранить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Candidates() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? '';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

  const canAdd = role === 'recruiter' || role === 'admin';

  const load = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const [cands, brs, poss] = await Promise.all([
        customFetch<Candidate[]>('/api/candidates', { headers: { Authorization: `Bearer ${token}` } }),
        customFetch<Branch[]>('/api/branches', { headers: { Authorization: `Bearer ${token}` } }),
        customFetch<Position[]>('/api/positions', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setCandidates(cands);
      setBranches(brs);
      setPositions(poss);
    } catch { /* ignore */ } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = c.fullName.toLowerCase().includes(q) ||
                            c.email.toLowerCase().includes(q) ||
                            c.phone.includes(searchTerm) ||
                            (c.iin || '').includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || c.offerStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [candidates, searchTerm, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'draft': return <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">Черновик</Badge>;
      case 'sent': return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">Отправлен</Badge>;
      case 'accepted': return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">Принят</Badge>;
      case 'expired': return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300">Истек</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout
      title="Реестр"
      actions={canAdd ? (
        <Button onClick={() => setLocation('/candidates/new')} size="sm">
          <UserPlus className="w-4 h-4 mr-2" />
          Добавить
        </Button>
      ) : undefined}
    >
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">
          Реестр всех кандидатов и сотрудников. Каждый участник редактирует свою часть:
          рекрутер — образование и опыт, маркетолог — фото, HR — филиал и должность.
        </p>
      </div>

      <Card className="mb-6 bg-card border-border shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Поиск по ФИО, email, телефону, ИИН..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background w-full"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Статус оффера" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="sent">Отправлен</SelectItem>
                <SelectItem value="accepted">Принят</SelectItem>
                <SelectItem value="expired">Истек</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="text-center p-12 border border-dashed rounded-lg bg-card">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">Записи не найдены</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Измените параметры поиска или добавьте нового кандидата.</p>
          {canAdd && (
            <Button onClick={() => setLocation('/candidates/new')} variant="outline">
              <UserPlus className="w-4 h-4 mr-2" />
              Добавить
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground">ФИО / Контакты</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">ИИН</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Филиал / Должность</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Статус</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCandidates.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground flex items-center gap-2">
                      {c.fullName}
                      {c.routingSheet?.isDoctor && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">Врач</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.email} • {c.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{c.iin}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{c.routingSheet?.branchName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{c.routingSheet?.positionName || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(c.offerStatus)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditingCandidate(c)}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingCandidate && (
        <EditCandidateDialog
          candidate={editingCandidate}
          branches={branches}
          positions={positions}
          open={!!editingCandidate}
          onOpenChange={(open) => !open && setEditingCandidate(null)}
          onSaved={load}
        />
      )}
    </AppLayout>
  );
}
