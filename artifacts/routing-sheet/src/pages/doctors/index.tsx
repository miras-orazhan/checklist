import React, { useState, useMemo, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Search, Stethoscope, Download, Upload, User, IdCard, Calendar, Mail, Phone, GraduationCap, Briefcase, Award, Save, X } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { compressPhoto } from '@/lib/photoUpload';

// ─── Types ───────────────────────────────────────────────────────────────────
interface DoctorRow {
  id: number;
  candidateId: number;
  routingSheetStatus: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  email: string;
  phone: string;
  iin: string;
  birthDate: string | null;
  gender: string | null;
  education: string | null;
  experience: string | null;
  certifications: string | null;
  branchId: number;
  branchName: string;
  positionId: number;
  positionName: string;
  photoUrl: string | null;
  marketingPhotoUrl: string | null;
  doctorProfileId: number | null;
  yearsExperience: number | null;
  specialty: string | null;
  ageRestrictions: string | null;
  siteDiscounts: string | null;
  about: string | null;
  procedures: string[] | null;
  createdAt: string;
}

interface Branch { id: number; name: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const GENDER_LABELS: Record<string, string> = { male: 'М', female: 'Ж' };

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'Оформляется',
  completed: 'Работает',
  cancelled: 'Найм отменён',
};

const STATUS_STYLES: Record<string, string> = {
  in_progress: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
};

// ─── Doctor edit dialog (photo + profile fields) ─────────────────────────────
interface EditDialogProps {
  doctor: DoctorRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function EditDoctorDialog({ doctor, open, onOpenChange, onSaved }: EditDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMarketing = user?.role === 'marketing';
  const isAccountManager = user?.role === 'account_manager';
  const isChief = user?.role === 'chief_physician';
  const isAdmin = user?.role === 'admin';

  // Marketing can only change photo. Account manager + chief + admin can
  // edit profile fields (specialty, about, etc.).
  const canEditPhoto = isMarketing || isAccountManager || isChief || isAdmin;
  const canEditProfile = isAccountManager || isChief || isAdmin;

  const [photoUrl, setPhotoUrl] = useState<string | null>(doctor.photoUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [specialty, setSpecialty] = useState(doctor.specialty ?? '');
  const [about, setAbout] = useState(doctor.about ?? '');
  const [procedures, setProcedures] = useState(
    Array.isArray(doctor.procedures) ? doctor.procedures.join('\n') : '',
  );
  const [ageRestrictions, setAgeRestrictions] = useState(doctor.ageRestrictions ?? '');
  const [siteDiscounts, setSiteDiscounts] = useState(doctor.siteDiscounts ?? '');
  const [yearsExperience, setYearsExperience] = useState(
    doctor.yearsExperience != null ? String(doctor.yearsExperience) : '',
  );
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setPhotoUrl(doctor.photoUrl);
      setSpecialty(doctor.specialty ?? '');
      setAbout(doctor.about ?? '');
      setProcedures(Array.isArray(doctor.procedures) ? doctor.procedures.join('\n') : '');
      setAgeRestrictions(doctor.ageRestrictions ?? '');
      setSiteDiscounts(doctor.siteDiscounts ?? '');
      setYearsExperience(doctor.yearsExperience != null ? String(doctor.yearsExperience) : '');
    }
  }, [open, doctor]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    setIsUploading(true);
    try {
      // Compress on the client first (1024×1024 JPEG q 0.85)
      const compressed = await compressPhoto(file);
      const token = localStorage.getItem('auth_token');

      // PUT directly to /api/doctors/:id/photo — server stores the file
      // and updates both doctor_profiles.photo_url and the marketing step.
      const resp = await fetch(`/api/doctors/${doctor.id}/photo`, {
        method: 'PUT',
        headers: {
          'Content-Type': compressed.type,
          Authorization: `Bearer ${token}`,
        },
        body: compressed,
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const err = await resp.json();
          msg = err.error || msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = await resp.json();
      setPhotoUrl(data.url);
      toast({ title: 'Фото обновлено', description: 'Сжато до 1024px и сохранено' });
      // Invalidate queries so other pages refetch
      qc.invalidateQueries({ queryKey: ['doctors'] });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Ошибка загрузки фото',
        description: err?.message || 'Не удалось загрузить',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const body: Record<string, unknown> = {};
      if (canEditProfile) {
        body.specialty = specialty || null;
        body.about = about || null;
        body.procedures = procedures
          ? procedures.split('\n').map((s) => s.trim()).filter(Boolean)
          : null;
        body.siteDiscounts = siteDiscounts || null;
      }
      if (isChief || isAdmin) {
        body.ageRestrictions = ageRestrictions || null;
        body.experience = yearsExperience ? Number(yearsExperience) : null;
      }

      const resp = await fetch(`/api/doctors/${doctor.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const err = await resp.json();
          msg = err.error || msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      toast({ title: 'Профиль сохранён' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Ошибка сохранения',
        description: err?.message || 'Не удалось сохранить',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!photoUrl) return;
    const url = photoUrl + (photoUrl.includes('?') ? '&' : '?') + 'download=1';
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctor-${doctor.lastName}-${doctor.firstName}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-blue-500" />
            {doctor.fullName}
          </DialogTitle>
          <DialogDescription>
            {doctor.positionName} • {doctor.branchName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Photo section ─────────────────────────────────────────── */}
          <div className="bg-muted/30 p-4 rounded-lg border">
            <Label className="text-sm font-medium mb-3 block">Фото врача</Label>
            <div className="flex items-start gap-4">
              <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center border overflow-hidden flex-shrink-0 relative">
                {isUploading && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
                {photoUrl ? (
                  <img src={photoUrl} alt={doctor.fullName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                {canEditPhoto && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {canEditPhoto && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isSaving}
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      {photoUrl ? 'Заменить фото' : 'Загрузить фото'}
                    </Button>
                  )}
                  {photoUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={handleDownload}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Скачать
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {photoUrl
                    ? 'Фото доступно всем сотрудникам. Автосжатие до 1024×1024 px.'
                    : canEditPhoto
                      ? 'Загрузите официальное фото врача.'
                      : 'Фото ещё не загружено.'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Doctor info (read-only context) ──────────────────────── */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <IdCard className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">ИИН:</span>
              <span className="font-mono">{doctor.iin || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Рождение:</span>
              <span>{formatDate(doctor.birthDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Email:</span>
              <span>{doctor.email || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Телефон:</span>
              <span>{doctor.phone || '—'}</span>
            </div>
          </div>

          {/* Recruiter-entered professional data — read-only for context */}
          {(doctor.education || doctor.experience || doctor.certifications) && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Данные от рекрутера</p>
              {doctor.education && (
                <div className="flex items-start gap-2 text-sm">
                  <GraduationCap className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground">Образование: </span>
                    <span className="whitespace-pre-wrap">{doctor.education}</span>
                  </div>
                </div>
              )}
              {doctor.experience && (
                <div className="flex items-start gap-2 text-sm">
                  <Briefcase className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground">Опыт: </span>
                    <span className="whitespace-pre-wrap">{doctor.experience}</span>
                  </div>
                </div>
              )}
              {doctor.certifications && (
                <div className="flex items-start gap-2 text-sm">
                  <Award className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground">Сертификаты: </span>
                    <span className="whitespace-pre-wrap">{doctor.certifications}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Editable profile fields ──────────────────────────────── */}
          {canEditProfile && (
            <div className="space-y-4 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Профиль врача {isMarketing && '(только чтение)'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Специализация</Label>
                  <Input
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="Кардиолог"
                    disabled={isSaving}
                  />
                </div>
                {(isChief || isAdmin) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Стаж (лет)</Label>
                    <Input
                      type="number"
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value)}
                      placeholder="10"
                      disabled={isSaving}
                    />
                  </div>
                )}
              </div>
              {(isChief || isAdmin) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Возрастные ограничения</Label>
                    <Input
                      value={ageRestrictions}
                      onChange={(e) => setAgeRestrictions(e.target.value)}
                      placeholder="18+"
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Скидки на сайте</Label>
                    <Input
                      value={siteDiscounts}
                      onChange={(e) => setSiteDiscounts(e.target.value)}
                      placeholder="10% пенсионерам"
                      disabled={isSaving}
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">О враче</Label>
                <Textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="Краткое описание для сайта..."
                  rows={3}
                  className="resize-none"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Процедуры (по одной на строку)</Label>
                <Textarea
                  value={procedures}
                  onChange={(e) => setProcedures(e.target.value)}
                  placeholder="ЭКГ&#10;УЗИ сердца&#10;Холтер"
                  rows={3}
                  className="resize-none"
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            <X className="w-4 h-4 mr-1" />
            Закрыть
          </Button>
          {canEditProfile && (
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
export default function Doctors() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<DoctorRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingDoctor, setEditingDoctor] = useState<DoctorRow | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const [emps, brs] = await Promise.all([
        customFetch<DoctorRow[]>('/api/doctors', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        customFetch<Branch[]>('/api/branches', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setRows(emps);
      setBranches(brs);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить реестр');
      toast({
        variant: 'destructive',
        title: 'Ошибка загрузки',
        description: err?.message || 'Не удалось загрузить реестр врачей',
      });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.routingSheetStatus !== statusFilter) return false;
      if (branchFilter !== 'all' && r.branchId !== Number(branchFilter)) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.iin.includes(searchTerm) ||
          (r.specialty ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, statusFilter, branchFilter, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((r) => r.routingSheetStatus === 'completed').length,
      onboarding: rows.filter((r) => r.routingSheetStatus === 'in_progress').length,
      withPhoto: rows.filter((r) => !!r.photoUrl).length,
    };
  }, [rows]);

  return (
    <AppLayout title="Реестр врачей">
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">
          Список всех врачей клиники. Можно просматривать данные, загружать и
          заменять фотографии, редактировать профиль (специализация, процедуры и т.д.).
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Stethoscope className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Всего врачей</div>
                <div className="text-xl font-bold">{stats.total}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <User className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Работает</div>
                <div className="text-xl font-bold text-emerald-700">{stats.active}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Оформляется</div>
                <div className="text-xl font-bold text-amber-700">{stats.onboarding}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Upload className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">С фото</div>
                <div className="text-xl font-bold text-blue-700">{stats.withPhoto}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Поиск по ФИО, ИИН, email, специализации..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Филиал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все филиалы</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="in_progress">Оформляется</SelectItem>
                <SelectItem value="completed">Работает</SelectItem>
                <SelectItem value="cancelled">Найм отменён</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Найдено: <strong className="text-foreground">{filteredRows.length}</strong> из {rows.length}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Stethoscope className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>Врачи не найдены. Измените параметры фильтра.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Фото</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">ФИО / Контакты</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Специализация</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Филиал / Должность</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Статус</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3">
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center border overflow-hidden">
                        {r.photoUrl ? (
                          <img src={r.photoUrl} alt={r.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-muted-foreground/40" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground">{r.fullName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.email}</div>
                      <div className="text-xs text-muted-foreground">
                        ИИН: <span className="font-mono">{r.iin || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {r.specialty ? (
                        <span className="text-sm">{r.specialty}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">не указана</span>
                      )}
                      {r.yearsExperience != null && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Стаж: {r.yearsExperience} лет
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm">{r.branchName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.positionName || '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.routingSheetStatus] ?? ''}`}>
                        {STATUS_LABELS[r.routingSheetStatus] ?? r.routingSheetStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingDoctor(r)}
                      >
                        {user?.role === 'marketing' ? 'Фото' : 'Открыть'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit dialog */}
      {editingDoctor && (
        <EditDoctorDialog
          doctor={editingDoctor}
          open={!!editingDoctor}
          onOpenChange={(open) => !open && setEditingDoctor(null)}
          onSaved={load}
        />
      )}
    </AppLayout>
  );
}
