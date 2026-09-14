import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import AdminNav from '@/components/AdminNav';
import TeacherSmsContextPanel from '@/components/TeacherSmsContextPanel';
import { getSchoolContext } from '@/lib/utils/school';
import { t } from '@/lib/i18n';
import type {
  BridgeGameComponent,
  BridgeOutcome,
  BridgePublishGate,
  BridgeStatus,
  EcceLessonBridge,
  SmsLessonContext,
  SmsLessonContextQuery,
} from '@/lib/types/ecceBridge';

/* ── Constants ────────────────────────────────────────── */

/** Standalone templates only — a bridge component is never a `game-chain`. */
const TEMPLATES: Array<{ id: string; labelKey: string }> = [
  { id: 'matching', labelKey: 'gameCreator.tpl.matching.label' },
  { id: 'memory-pairs', labelKey: 'gameCreator.tpl.memoryPairs.label' },
  { id: 'tap-recognition', labelKey: 'gameCreator.tpl.tapRecognition.label' },
  { id: 'drag-sort', labelKey: 'gameCreator.tpl.dragSort.label' },
  { id: 'quiz', labelKey: 'gameCreator.tpl.quiz.label' },
  { id: 'fill-in-blank', labelKey: 'gameCreator.tpl.fillBlank.label' },
  { id: 'puzzle-split', labelKey: 'gameCreator.tpl.puzzleSplit.label' },
  { id: 'label-diagram', labelKey: 'gameCreator.tpl.labelDiagram.label' },
  { id: 'stage-sequence', labelKey: 'gameCreator.tpl.stageSequence.label' },
];

/** Mirrors the API's EVIDENCE_ROUTES (kidTeacherObservation response_route). */
const EVIDENCE_ROUTES = [
  'point',
  'gesture',
  'movement',
  'speech',
  'home_language',
  'sign',
  'AAC',
  'drawing',
  'mark-making',
  'mixed',
];

const STATUS_STYLES: Record<BridgeStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  ready_for_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  recalled: 'bg-red-100 text-red-800',
};

interface LessonOption {
  id: string;
  title?: string;
  subject?: string;
  age_level?: string;
}

interface BridgeForm {
  id: string | null;
  status: BridgeStatus | null;
  lesson_id: string;
  outcome_id: string;
  objective: string;
  concrete_experience: string;
  previous_experience: string;
  home_connection: string;
  micro_objectives: string;
  success_evidence: string;
  evidence_routes: string[];
  assessment_note: string;
  components: BridgeGameComponent[];
}

const EMPTY_FORM: BridgeForm = {
  id: null,
  status: null,
  lesson_id: '',
  outcome_id: '',
  objective: '',
  concrete_experience: '',
  previous_experience: '',
  home_connection: '',
  micro_objectives: '',
  success_evidence: '',
  evidence_routes: ['point'],
  assessment_note: '',
  components: [{ template: 'matching', item_count: 6, order: 1 }],
};

const toLines = (value: string): string[] =>
  value.split('\n').map((line) => line.trim()).filter(Boolean);

const fromLines = (value: unknown): string =>
  Array.isArray(value) ? (value as string[]).join('\n') : '';

/** Primary may plan up to 15 playable items; every other band stays 5-10. */
const itemCap = (band: string | null | undefined): number =>
  String(band || '').trim() === 'Primary' ? 15 : 10;

/* ── Small presentational helpers ─────────────────────── */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none';

function StatusBadge({ status }: { status: BridgeStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {t(`teacher.bridge.status.${status}`)}
    </span>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function BridgeAuthoring() {
  const isAdmin = useMemo(() => getSchoolContext().isAdmin, []);

  const [contextQuery, setContextQuery] = useState<SmsLessonContextQuery>({ class_code: '' });
  const [context, setContext] = useState<SmsLessonContext | null>(null);

  const [outcomes, setOutcomes] = useState<BridgeOutcome[]>([]);
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [bridges, setBridges] = useState<EcceLessonBridge[]>([]);

  const [form, setForm] = useState<BridgeForm>(EMPTY_FORM);
  const [gate, setGate] = useState<BridgePublishGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const bandCap = itemCap(context?.age_band);

  /* ── Loads ─────────────────────────────────────────── */

  const loadExisting = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.BRIDGES.LIST);
      setBridges(res.data?.data || []);
    } catch (err: any) {
      toast.error(err?.message || t('teacher.bridge.action.failed'));
    }
  }, []);

  const loadLessons = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.LESSONS.LIST, { params: {} });
      setLessons(res.data?.data || []);
    } catch (err: any) {
      toast.error(err?.message || t('teacher.bridge.action.failed'));
    }
  }, []);

  const loadOutcomes = useCallback(async (ageBand: string | null, subjectId: string | null) => {
    try {
      const params: Record<string, string> = {};
      if (ageBand) params.age_band = ageBand;
      if (subjectId) params.subject_id = subjectId;
      const res = await apiClient.get(ENDPOINTS.BRIDGES.OUTCOMES, { params });
      setOutcomes(res.data?.data || []);
    } catch (err: any) {
      toast.error(err?.message || t('teacher.bridge.action.failed'));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLessons(), loadExisting()]).finally(() => setLoading(false));
  }, [loadLessons, loadExisting]);

  const onContextResolved = useCallback((next: SmsLessonContext) => {
    setContext(next);
    // The resolved context is the authoritative class/term/week; prefill what the
    // bridge must record so the reviewer sees the same cell the SMS holds.
    setForm((prev) => ({
      ...prev,
      lesson_id: prev.lesson_id || next.sms_lesson_id || '',
    }));
    loadOutcomes(next.age_band, next.subject_code);
  }, [loadOutcomes]);

  const refreshGate = useCallback(async (id: string) => {
    try {
      const res = await apiClient.get(ENDPOINTS.BRIDGES.PUBLISH_GATE(id));
      setGate(res.data?.data || null);
    } catch (err: any) {
      setGate(null);
      toast.error(err?.message || t('teacher.bridge.action.failed'));
    }
  }, []);

  /* ── Editor helpers ────────────────────────────────── */

  const openBridge = useCallback((row: EcceLessonBridge) => {
    const bp = (row.game_plan || {}) as { components?: BridgeGameComponent[] };
    setForm({
      id: row.id || null,
      status: (row.status as BridgeStatus) || 'draft',
      lesson_id: row.lesson_id || '',
      outcome_id: row.outcome_id || '',
      objective: row.objective || '',
      concrete_experience: row.concrete_experience || '',
      previous_experience: (row.previous_experience as string) || '',
      home_connection: (row.home_connection as string) || '',
      micro_objectives: fromLines(row.micro_objectives),
      success_evidence: fromLines(row.success_evidence),
      evidence_routes: Array.isArray(row.evidence_routes) ? (row.evidence_routes as string[]) : [],
      assessment_note: String((row.assessment_plan as any)?.note || ''),
      components: bp.components?.length ? bp.components : EMPTY_FORM.components,
    });
    if (row.id) refreshGate(row.id);
  }, [refreshGate]);

  const setComponent = (index: number, patch: Partial<BridgeGameComponent>) => {
    setForm((prev) => ({
      ...prev,
      components: prev.components.map((component, i) => (i === index ? { ...component, ...patch } : component)),
    }));
  };

  const toggleEvidenceRoute = (route: string) => {
    setForm((prev) => ({
      ...prev,
      evidence_routes: prev.evidence_routes.includes(route)
        ? prev.evidence_routes.filter((r) => r !== route)
        : [...prev.evidence_routes, route],
    }));
  };

  /* ── Save / submit ─────────────────────────────────── */

  const validationError = (): string | null => {
    if (!context) return t('teacher.bridge.error.context');
    if (!form.outcome_id) return t('teacher.bridge.error.outcome');
    if (!form.lesson_id) return t('teacher.bridge.error.lesson');
    if (!form.objective.trim()) return t('teacher.bridge.error.objective');
    if (!form.concrete_experience.trim()) return t('teacher.bridge.error.concrete');
    if (!form.evidence_routes.length) return t('teacher.bridge.error.evidence');
    return null;
  };

  const saveDraft = useCallback(async (): Promise<string | null> => {
    const problem = validationError();
    if (problem) {
      toast.error(problem);
      return null;
    }
    setBusy('save');
    try {
      const payload = {
        lesson_id: form.lesson_id,
        outcome_id: form.outcome_id,
        class_code: context?.class_code || undefined,
        class_label: context?.class_label || undefined,
        age_band: context?.age_band || undefined,
        academic_year: context?.academic_year || undefined,
        term_name: context?.term_name || undefined,
        week_number: context?.week_number ?? undefined,
        subject_id: context?.subject_code || undefined,
        sms_lesson_id: context?.sms_lesson_id || undefined,
        objective: form.objective.trim(),
        concrete_experience: form.concrete_experience.trim(),
        previous_experience: form.previous_experience.trim() || undefined,
        home_connection: form.home_connection.trim() || undefined,
        micro_objectives: toLines(form.micro_objectives),
        success_evidence: toLines(form.success_evidence),
        evidence_routes: form.evidence_routes,
        assessment_plan: { note: form.assessment_note.trim() },
        game_plan: {
          components: form.components.map((component, index) => ({
            template: component.template,
            item_count: Number(component.item_count),
            order: index + 1,
          })),
        },
      };
      const res = form.id
        ? await apiClient.patch(ENDPOINTS.BRIDGES.UPDATE(form.id), payload)
        : await apiClient.post(ENDPOINTS.BRIDGES.CREATE, payload);
      const saved = res.data?.data as EcceLessonBridge;
      setForm((prev) => ({ ...prev, id: saved?.id || prev.id, status: (saved?.status as BridgeStatus) || 'draft' }));
      toast.success(t('teacher.bridge.action.saved'));
      await loadExisting();
      return saved?.id || form.id;
    } catch (err: any) {
      const details = err?.response?.data?.errors;
      const firstDetail = details ? Object.values(details)[0] : null;
      toast.error(String(firstDetail || err?.message || t('teacher.bridge.action.failed')));
      return null;
    } finally {
      setBusy('');
    }
  }, [context, form, loadExisting]);

  const submitForReview = useCallback(async () => {
    const id = form.id;
    if (!id) {
      toast.error(t('teacher.bridge.action.save'));
      return;
    }
    setBusy('submit');
    try {
      await apiClient.post(ENDPOINTS.BRIDGES.SUBMIT_REVIEW(id));
      toast.success(t('teacher.bridge.action.submitted'));
      setForm((prev) => ({ ...prev, status: 'ready_for_review' }));
      await Promise.all([refreshGate(id), loadExisting()]);
    } catch (err: any) {
      toast.error(err?.message || t('teacher.bridge.action.failed'));
    } finally {
      setBusy('');
    }
  }, [form.id, loadExisting, refreshGate]);

  /** Approve / publish / recall are admin-only; the API enforces it too. */
  const reviewAction = useCallback(async (action: 'APPROVE' | 'PUBLISH' | 'RECALL') => {
    const id = form.id;
    if (!id) return;
    setBusy(action);
    try {
      const res = await apiClient.post(ENDPOINTS.BRIDGES[action](id));
      const next = res.data?.data as EcceLessonBridge;
      setForm((prev) => ({ ...prev, status: (next?.status as BridgeStatus) || prev.status }));
      const nextGate = res.data?.gate;
      if (nextGate) setGate(nextGate);
      else await refreshGate(id);
      toast.success(res.data?.message || t('teacher.bridge.action.failed'));
      await loadExisting();
    } catch (err: any) {
      const body = err?.response?.data;
      toast.error(body?.message || err?.message || t('teacher.bridge.action.failed'));
      if (body?.gates) setGate(body);
    } finally {
      setBusy('');
    }
  }, [form.id, loadExisting, refreshGate]);

  /* ── Render ────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <main className="mx-auto max-w-4xl px-3 py-4 sm:px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('teacher.bridge.title')}</h1>
            <p className="text-xs text-gray-500">{t('teacher.bridge.subtitle')}</p>
          </div>
          <Link to="/teacher/lessons" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('teacher.approvals.backToLessons')}
          </Link>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('teacher.bridge.loading')}
          </p>
        ) : (
          <div className="space-y-4">
            <Section title={t('teacher.bridge.section.context')} hint={t('teacher.bridge.selectHint')}>
              <TeacherSmsContextPanel value={contextQuery} onChange={setContextQuery} onResolved={onContextResolved} />
              {context && (
                <p className="text-xs text-gray-500">
                  {context.class_label || context.class_code} · {context.age_band || '—'} · {context.term_name || '—'} ·{' '}
                  {context.subject_code || '—'}
                </p>
              )}
            </Section>

            <Section title={t('teacher.bridge.section.outcome')}>
              <Field label={t('teacher.bridge.field.selectOutcome')}>
                <select
                  value={form.outcome_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, outcome_id: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {outcomes.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>
                      {outcome.statement}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title={t('teacher.bridge.section.lesson')}>
              <Field label={t('teacher.bridge.field.selectLesson')}>
                <select
                  value={form.lesson_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, lesson_id: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {[lesson.title, lesson.subject].filter(Boolean).join(' · ') || lesson.id}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title={t('teacher.bridge.section.objective')}>
              <Field label={t('teacher.bridge.field.objective')}>
                <textarea
                  rows={2}
                  value={form.objective}
                  onChange={(event) => setForm((prev) => ({ ...prev, objective: event.target.value }))}
                  placeholder={t('teacher.bridge.field.objectivePlaceholder')}
                  className={inputClass}
                />
              </Field>
              <Field label={`${t('teacher.bridge.field.concrete')} — ${t('teacher.bridge.field.onePerLine')}`}>
                <textarea
                  rows={2}
                  value={form.concrete_experience}
                  onChange={(event) => setForm((prev) => ({ ...prev, concrete_experience: event.target.value }))}
                  placeholder={t('teacher.bridge.field.concretePlaceholder')}
                  className={inputClass}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`${t('teacher.bridge.field.microObjectives')} — ${t('teacher.bridge.field.onePerLine')}`}>
                  <textarea
                    rows={3}
                    value={form.micro_objectives}
                    onChange={(event) => setForm((prev) => ({ ...prev, micro_objectives: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label={`${t('teacher.bridge.field.successEvidence')} — ${t('teacher.bridge.field.onePerLine')}`}>
                  <textarea
                    rows={3}
                    value={form.success_evidence}
                    onChange={(event) => setForm((prev) => ({ ...prev, success_evidence: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('teacher.bridge.field.previousExperience')}>
                  <input
                    value={form.previous_experience}
                    onChange={(event) => setForm((prev) => ({ ...prev, previous_experience: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('teacher.bridge.field.homeConnection')}>
                  <input
                    value={form.home_connection}
                    onChange={(event) => setForm((prev) => ({ ...prev, home_connection: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>

            <Section title={t('teacher.bridge.section.evidence')}>
              <Field label={t('teacher.bridge.field.evidenceRoutes')}>
                <div className="flex flex-wrap gap-2">
                  {EVIDENCE_ROUTES.map((route) => {
                    const active = form.evidence_routes.includes(route);
                    return (
                      <button
                        key={route}
                        type="button"
                        onClick={() => toggleEvidenceRoute(route)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          active ? 'border-[#0F4D92] bg-[#0F4D92] text-white' : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        {t(`teacher.bridge.evidence.${route}`)}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </Section>

            <Section title={t('teacher.bridge.section.game')} hint={t('teacher.bridge.bandCap')}>
              {form.components.length === 0 && <p className="text-xs text-gray-500">{t('teacher.bridge.game.empty')}</p>}
              {form.components.map((component, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <Field label={t('teacher.bridge.field.template')}>
                    <select
                      value={component.template}
                      onChange={(event) => setComponent(index, { template: event.target.value })}
                      className={inputClass}
                    >
                      {TEMPLATES.map((template) => (
                        <option key={template.id} value={template.id}>
                          {t(template.labelKey)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('teacher.bridge.field.items')}>
                    <input
                      type="number"
                      min={5}
                      max={bandCap}
                      value={component.item_count ?? ''}
                      onChange={(event) => setComponent(index, { item_count: Number(event.target.value) })}
                      className={`${inputClass} w-24`}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, components: prev.components.filter((_, i) => i !== index) }))}
                    className="mb-0.5 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('teacher.bridge.game.remove')}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  components: [...prev.components, { template: 'matching', item_count: 6, order: prev.components.length + 1 }],
                }))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F4D92] px-3 py-2 text-xs font-semibold text-[#0F4D92]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('teacher.bridge.game.add')}
              </button>
            </Section>

            <Section title={t('teacher.bridge.section.assessment')}>
              <Field label={t('teacher.bridge.field.assessmentNote')}>
                <textarea
                  rows={2}
                  value={form.assessment_note}
                  onChange={(event) => setForm((prev) => ({ ...prev, assessment_note: event.target.value }))}
                  className={inputClass}
                />
              </Field>
            </Section>

            <Section title={t('teacher.bridge.section.review')}>
              <div className="flex flex-wrap items-center gap-2">
                {form.status && <StatusBadge status={form.status} />}
                <button
                  type="button"
                  onClick={() => saveDraft()}
                  disabled={busy !== ''}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F4D92] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {busy === 'save' ? t('teacher.bridge.action.saving') : t('teacher.bridge.action.save')}
                </button>
                <button
                  type="button"
                  onClick={submitForReview}
                  disabled={busy !== '' || !form.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F4D92] px-3 py-2 text-xs font-semibold text-[#0F4D92] disabled:opacity-50"
                >
                  {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {busy === 'submit' ? t('teacher.bridge.action.submitting') : t('teacher.bridge.action.submit')}
                </button>
                {form.id && (
                  <button
                    type="button"
                    onClick={() => refreshGate(form.id as string)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('teacher.bridge.action.refreshGate')}
                  </button>
                )}
              </div>

              {isAdmin && form.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                  <button
                    type="button"
                    onClick={() => reviewAction('APPROVE')}
                    disabled={busy !== ''}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('teacher.bridge.action.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewAction('PUBLISH')}
                    disabled={busy !== ''}
                    className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('teacher.bridge.action.publish')}
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewAction('RECALL')}
                    disabled={busy !== ''}
                    className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    {t('teacher.bridge.action.recall')}
                  </button>
                </div>
              )}
              {!isAdmin && <p className="text-xs text-gray-500">{t('teacher.bridge.reviewerOnly')}</p>}

              {gate && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    {gate.publishable ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        {t('teacher.bridge.gate.publishable')}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        {t('teacher.bridge.gate.blocked', { count: gate.blocking_reasons.length })}
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs font-medium text-gray-500">{t('teacher.bridge.gate.title')}</p>
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(gate.gates).map(([name, passed]) => (
                      <li key={name} className={`text-xs ${passed ? 'text-green-700' : 'text-red-700'}`}>
                        {passed ? '✓' : '✗'} {name}
                      </li>
                    ))}
                  </ul>
                  {gate.blocking_reasons.length > 0 && (
                    <>
                      <p className="mt-2 text-xs font-medium text-gray-500">{t('teacher.bridge.gate.blockers')}</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {gate.blocking_reasons.map((reason) => (
                          <li key={reason} className="text-xs text-red-700">{reason}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {gate.not_evaluated?.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {t('teacher.bridge.gate.notEvaluated')}: {gate.not_evaluated.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </Section>

            <Section title={t('teacher.bridge.existing.title')}>
              {bridges.length === 0 ? (
                <p className="text-xs text-gray-500">{t('teacher.bridge.existing.empty')}</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {bridges.map((bridge) => (
                    <li key={bridge.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2 text-xs text-gray-700">
                        <StatusBadge status={(bridge.status as BridgeStatus) || 'draft'} />
                        {bridge.class_label} · {bridge.term_name} · {t('teacher.bridge.field.items')} {bridge.week_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => openBridge(bridge)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        {t('teacher.bridge.existing.open')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
