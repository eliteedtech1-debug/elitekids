import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Gamepad2,
  BookOpen,
  Eye,
  Send,
  FileJson,
  AlertCircle,
  Wand2,
  Pencil,
  Puzzle,
  GripVertical,
  MessageCircleQuestion,
  Type,
  Blocks,
  Layers,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import AdminNav from '@/components/AdminNav';
import GameConfigEditor from '@/components/GameConfigEditor';
import SceneEditor from '@/components/SceneEditor';
import type { PromptMode, ResponseMode } from '@/lib/types/game';
import { GAME_INTERACTIONS, validateInteraction, suggestResponseMode, describeInteraction } from '@/lib/types/game';

/* ── Constants ─────────────────────────────────────────── */

const AGE_LEVELS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'] as const;

const TEMPLATES = [
  {
    id: 'matching',
    labelKey: 'gameCreator.tpl.matching.label',
    icon: <Puzzle className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.matching.desc',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    activeColor: 'bg-blue-100 border-blue-500 ring-2 ring-blue-200 text-blue-800',
  },
  {
    id: 'memory-pairs',
    labelKey: 'gameCreator.tpl.memoryPairs.label',
    icon: <Layers className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.memoryPairs.desc',
    color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    activeColor: 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-200 text-indigo-800',
  },
  {
    id: 'tap-recognition',
    labelKey: 'gameCreator.tpl.tapRecognition.label',
    icon: <Blocks className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.tapRecognition.desc',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    activeColor: 'bg-purple-100 border-purple-500 ring-2 ring-purple-200 text-purple-800',
  },
  {
    id: 'drag-sort',
    labelKey: 'gameCreator.tpl.dragSort.label',
    icon: <GripVertical className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.dragSort.desc',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    activeColor: 'bg-amber-100 border-amber-500 ring-2 ring-amber-200 text-amber-800',
  },
  {
    id: 'quiz',
    labelKey: 'gameCreator.tpl.quiz.label',
    icon: <MessageCircleQuestion className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.quiz.desc',
    color: 'bg-green-50 border-green-200 text-green-700',
    activeColor: 'bg-green-100 border-green-500 ring-2 ring-green-200 text-green-800',
  },
  {
    id: 'fill-in-blank',
    labelKey: 'gameCreator.tpl.fillBlank.label',
    icon: <Type className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.fillBlank.desc',
    color: 'bg-rose-50 border-rose-200 text-rose-700',
    activeColor: 'bg-rose-100 border-rose-500 ring-2 ring-rose-200 text-rose-800',
  },
  {
    id: 'puzzle-split',
    labelKey: 'gameCreator.tpl.puzzleSplit.label',
    icon: <Puzzle className="h-5 w-5" />,
    descKey: 'gameCreator.tpl.puzzleSplit.desc',
    color: 'bg-teal-50 border-teal-200 text-teal-700',
    activeColor: 'bg-teal-100 border-teal-500 ring-2 ring-teal-200 text-teal-800',
  },
] as const;

/* ── JSON Editor Template ──────────────────────────────── */

function getConfigTemplate(template: string, ageLevel: string): string {
  // Default prompt/response modes per template (cross-modal by default)
  const defaultModes: Record<string, { promptMode: string; responseMode: string }> = {
    matching: { promptMode: 'text', responseMode: 'image' },
    'memory-pairs': { promptMode: 'text', responseMode: 'image' },
    // Cross-modal: show image (no text), child picks the correct text label
    'tap-recognition': { promptMode: 'image', responseMode: 'text' },
    'drag-sort': { promptMode: 'text', responseMode: 'image' },
    quiz: { promptMode: 'image', responseMode: 'text' },
    'fill-in-blank': { promptMode: 'text', responseMode: 'text' },
    'puzzle-split': { promptMode: 'image', responseMode: 'image' },
  };
  const modes = defaultModes[template] || { promptMode: 'text', responseMode: 'text' };

  const base = {
    gameId: `game-${Date.now()}`,
    template,
    lessonId: 'LESSON_ID_WILL_BE_SET',
    ageLevel,
    category: 'general',
    tier: 0,
    item_id: `item-${Date.now()}`,
    durationTargetSec: 60,
    // Multimodal interaction: how concept is presented and how learner responds
    promptMode: modes.promptMode,   // 'text' | 'image' | 'audio' | 'context'
    responseMode: modes.responseMode, // 'text' | 'image' | 'audio'
    rewards: { starsOnComplete: 3, xp: 50 },
    successThresholdPct: 70,
  };

  const templates: Record<string, object> = {
    matching: {
      ...base,
      pairs: [
        { a: 'Apple', b: '🍌 Banana', image: 'https://example.com/apple.png' },
        { a: 'Banana', b: '🍎 Apple', image: 'https://example.com/banana.png' },
        { a: 'Cherry', b: '🍇 Grape', image: 'https://example.com/cherry.png' },
        { a: 'Grape', b: '🍒 Cherry', image: 'https://example.com/grape.png' },
      ],
    },
    'memory-pairs': {
      ...base,
      assets: {
        background: 'https://example.com/bg.png',
        items: [
          { id: 'cat', image: 'https://example.com/cat.png', matches: 'cat-word' },
          { id: 'cat-word', image: 'https://example.com/cat-word.png', matches: 'cat' },
          { id: 'dog', image: 'https://example.com/dog.png', matches: 'dog-word' },
          { id: 'dog-word', image: 'https://example.com/dog-word.png', matches: 'dog' },
        ],
      },
    },
    'tap-recognition': {
      ...base,
      prompt: 'Tap the red apple!',
      context: 'A fruit that is red and round',
      items: [
        { id: 'obj1', image: 'https://example.com/red-apple.png', text: 'Red Apple', context: 'A fruit that is red and round' },
        { id: 'obj2', image: 'https://example.com/green-apple.png', text: 'Green Apple', context: 'A fruit that is green' },
        { id: 'obj3', image: 'https://example.com/banana.png', text: 'Banana', context: 'A yellow curved fruit' },
      ],
      correctId: 'obj1',
    },
    'drag-sort': {
      ...base,
      assets: {
        background: 'https://example.com/bg.png',
        buckets: [
          { id: 'b1', label: 'Fruits', image: 'https://example.com/fruits-icon.png' },
          { id: 'b2', label: 'Vegetables', image: 'https://example.com/veggies-icon.png' },
        ],
        items: [
          { id: 'i1', image: 'https://example.com/apple.png', bucketId: 'b1' },
          { id: 'i2', image: 'https://example.com/carrot.png', bucketId: 'b2' },
          { id: 'i3', image: 'https://example.com/banana.png', bucketId: 'b1' },
          { id: 'i4', image: 'https://example.com/broccoli.png', bucketId: 'b2' },
        ],
      },
    },
    quiz: {
      ...base,
      question: 'What color is the sky?',
      image: 'https://example.com/sky.png',
      context: 'Look up on a clear day',
      options: [
        { id: 'o1', label: 'Blue', image: 'https://example.com/blue.png' },
        { id: 'o2', label: 'Red', image: 'https://example.com/red.png' },
        { id: 'o3', label: 'Green', image: 'https://example.com/green.png' },
      ],
      correctId: 'o1',
    },
    'fill-in-blank': {
      ...base,
      sentence: 'The cat sat on the ___',
      blanks: [
        { id: 0, answer: 'mat' },
      ],
      wordBank: ['mat', 'hat', 'bat', 'cat'],
    },
    'puzzle-split': {
      ...base,
      originalImageUrl: 'https://example.com/puzzle-image.png',
      difficulties: {
        easy: {
          pieces: [
            { id: 'p1', row: 0, col: 0, imageUrl: 'https://example.com/piece-1.png' },
            { id: 'p2', row: 0, col: 1, imageUrl: 'https://example.com/piece-2.png' },
            { id: 'p3', row: 1, col: 0, imageUrl: 'https://example.com/piece-3.png' },
            { id: 'p4', row: 1, col: 1, imageUrl: 'https://example.com/piece-4.png' },
          ],
          grid: { rows: 2, cols: 2 },
          pieceSize: { width: 150, height: 150 },
          label: 'Easy',
          emoji: '⭐',
          minAge: 'Creche',
        },
        medium: {
          pieces: [],
          grid: { rows: 3, cols: 3 },
          pieceSize: { width: 100, height: 100 },
          label: 'Medium',
          emoji: '⭐⭐',
          minAge: 'Nursery',
        },
        hard: {
          pieces: [],
          grid: { rows: 4, cols: 4 },
          pieceSize: { width: 75, height: 75 },
          label: 'Hard',
          emoji: '⭐⭐⭐',
          minAge: 'KG1',
        },
        expert: {
          pieces: [],
          grid: { rows: 5, cols: 5 },
          pieceSize: { width: 60, height: 60 },
          label: 'Expert',
          emoji: '🏆',
          minAge: 'KG2',
        },
      },
    },
  };

  return JSON.stringify(templates[template] || base, null, 2);
}

/* ── Step Indicator ─────────────────────────────────────── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              i < current
                ? 'bg-green-500 text-white'
                : i === current
                ? 'bg-[#0F4D92] text-white ring-2 ring-[#0F4D92]/30'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-6 rounded ${i < current ? 'bg-green-500' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export default function GameCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Lesson info
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [ageLevel, setAgeLevel] = useState<string>('KG1');
  const [lessonText, setLessonText] = useState('');

  // NERDC curriculum compliance
  const [nerdcCode, setNerdcCode] = useState('');
  const [nerdcStrand, setNerdcStrand] = useState('');
  const [nerdcSubStrand, setNerdcSubStrand] = useState('');

  // Step 2: Template
  const [template, setTemplate] = useState<string>('');

  // Step 3: Config
  const [configJson, setConfigJson] = useState('');
  const [jsonError, setJsonError] = useState('');

  // Step 4: Scenes (optional)
  const [scenesJson, setScenesJson] = useState('');
  const [scenesError, setScenesError] = useState('');

  const [result, setResult] = useState<{ lesson_id: string; config_id: string } | null>(null);

  /* ── Step 1: Validate ── */
  const canStep1 = title.trim().length > 0 && subject.trim().length > 0;

  /* ── Step 2: Validate ── */
  const canStep2 = template.length > 0;

  /* ── Step 3: Validate ── */
  const validateJson = useCallback((value: string) => {
    try {
      JSON.parse(value);
      setJsonError('');
      return true;
    } catch (e: any) {
      setJsonError(e.message);
      return false;
    }
  }, []);

  const handleConfigChange = (value: string) => {
    setConfigJson(value);
    // Only validate if there's something to validate
    if (value.trim()) {
      validateJson(value);
    } else {
      setJsonError('');
    }
  };

  const initTemplate = useCallback((tpl: string) => {
    setConfigJson(getConfigTemplate(tpl, ageLevel));
    setJsonError('');
  }, [ageLevel]);

  const canStep3 = configJson.trim().length > 0 && !jsonError;

  /* ── Step 4: Validate scenes (optional) ── */
  const handleScenesChange = (value: string) => {
    setScenesJson(value);
    if (value.trim()) {
      try {
        JSON.parse(value);
        setScenesError('');
      } catch (e: any) {
        setScenesError(e.message);
      }
    } else {
      setScenesError('');
    }
  };

  const canStep4 = true; // scenes are optional

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: any = {
        title: title.trim(),
        subject: subject.trim(),
        age_level: ageLevel,
        template,
        config_json: JSON.parse(configJson),
        is_global: false,
      };
      if (lessonText.trim()) body.lesson_text = lessonText.trim();
      if (nerdcCode.trim()) body.nerdc_code = nerdcCode.trim();
      if (nerdcStrand.trim()) body.nerdc_strand = nerdcStrand.trim();
      if (nerdcSubStrand.trim()) body.nerdc_sub_strand = nerdcSubStrand.trim();
      if (scenesJson.trim()) {
        try {
          const parsed = JSON.parse(scenesJson);
          // Flatten wrapper shape and drop blank/narration-less scenes before submit.
          const list = Array.isArray(parsed) ? parsed : parsed?.scenes ? [parsed] : [];
          const scenesFlat: any[] = [];
          list.forEach((item: any) => {
            if (Array.isArray(item)) item.forEach((s) => scenesFlat.push(s));
            else if (item && Array.isArray(item.scenes)) item.scenes.forEach((s: any) => scenesFlat.push(s));
            else if (item && typeof item === 'object') scenesFlat.push(item);
          });
          const clean = scenesFlat.filter((s: any) => (s?.text ?? s?.narration ?? '').trim() !== '');
          if (clean.length > 0) body.scenes = clean;
        } catch { /* ignore bad scenes */ }
      }

      const res = await apiClient.post(ENDPOINTS.LESSONS.CREATE_MANUAL, body);
      const data = res.data?.data;
      setResult(data);
      toast.success(t('gameCreator.createdToast'));
      setStep(5); // show success
    } catch (err: any) {
      toast.error(err?.message || t('teacher.lessons.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      <AdminNav />

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </button>

        <h1 className="mb-1 text-xl font-bold text-gray-800">{t('gameCreator.title')}</h1>
        <p className="mb-4 text-sm text-gray-500">{t('gameCreator.subtitle')}</p>

        <StepIndicator current={step} total={5} />

        {/* ────────────── Step 0: Lesson Info ────────────── */}
        {step === 0 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#0F4D92]" />
              <h2 className="text-base font-bold text-gray-800">{t('gameCreator.lessonDetails')}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('teacher.lessons.titleField')}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('teacher.lessons.titlePlaceholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('teacher.lessons.subjectField')}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('teacher.lessons.subjectPlaceholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('gameCreator.ageLevel')}</label>
                <div className="flex flex-wrap gap-2">
                  {AGE_LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setAgeLevel(lvl)}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                        ageLevel === lvl
                          ? 'border-[#0F4D92] bg-[#0F4D92] text-white shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-[#0F4D92]/40 hover:bg-blue-50'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('gameCreator.lessonText')}</label>
                <textarea
                  value={lessonText}
                  onChange={(e) => setLessonText(e.target.value)}
                  placeholder={t('gameCreator.lessonTextPlaceholder')}
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                />
              </div>

              {/* NERDC Curriculum Compliance */}
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('gameCreator.nerdcAlignment')}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600">{t('gameCreator.optional')}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">{t('gameCreator.curriculumCode')}</label>
                    <input
                      type="text"
                      value={nerdcCode}
                      onChange={(e) => setNerdcCode(e.target.value)}
                      placeholder={t('gameCreator.codePlaceholder')}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">{t('gameCreator.strand')}</label>
                      <select
                        value={nerdcStrand}
                        onChange={(e) => setNerdcStrand(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                      >
                        <option value="">{t('gameCreator.selectStrand')}</option>
                        <option value="Literacy">{t('nerdc.strand.Literacy')}</option>
                        <option value="Numeracy">{t('nerdc.strand.Numeracy')}</option>
                        <option value="Science">{t('nerdc.strand.Science')}</option>
                        <option value="Social Studies">{t('nerdc.strand.Social Studies')}</option>
                        <option value="Creative Arts">{t('nerdc.strand.Creative Arts')}</option>
                        <option value="Physical Development">{t('nerdc.strand.Physical Development')}</option>
                        <option value="Language Development">{t('nerdc.strand.Language Development')}</option>
                        <option value="Civic Education">{t('nerdc.strand.Civic Education')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">{t('gameCreator.subStrand')}</label>
                      <input
                        type="text"
                        value={nerdcSubStrand}
                        onChange={(e) => setNerdcSubStrand(e.target.value)}
                        placeholder={t('gameCreator.subStrandPlaceholder')}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep(1)}
                disabled={!canStep1}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d76] disabled:opacity-40 active:scale-95 transition-all"
              >
                {t('common.next')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ────────────── Step 1: Template Picker ────────────── */}
        {step === 1 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-[#0F4D92]" />
              <h2 className="text-base font-bold text-gray-800">{t('gameCreator.chooseTemplate')}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => setTemplate(tpl.id)}
                  className={`rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
                    template === tpl.id ? tpl.activeColor : tpl.color
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {tpl.icon}
                    <span className="text-sm font-bold">{t(tpl.labelKey)}</span>
                  </div>
                  <p className="text-xs opacity-80">{t(tpl.descKey)}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.back')}
              </button>
              <button
                onClick={() => {
                  if (template && !configJson) initTemplate(template);
                  setStep(2);
                }}
                disabled={!canStep2}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d76] disabled:opacity-40 active:scale-95 transition-all"
              >
                {t('common.next')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ────────────── Step 2: Config Editor ────────────── */}
        {step === 2 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5 text-[#0F4D92]" />
                <h2 className="text-base font-bold text-gray-800">{t('gameCreator.configJson')}</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => initTemplate(template)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Wand2 className="h-3 w-3" /> {t('gameCreator.resetTemplate')}
                </button>
              </div>
            </div>

            {/* Visual plug-&-play forms (Easy mode) + Advanced JSON tab.
                configJson remains the single source of truth. */}
            <GameConfigEditor
              template={template}
              configJson={configJson}
              onJsonChange={handleConfigChange}
            />

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.back')}
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canStep3}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d76] disabled:opacity-40 active:scale-95 transition-all"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ────────────── Step 3: Scenes (optional) ────────────── */}
        {step === 3 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[#0F4D92]" />
              <h2 className="text-base font-bold text-gray-800">{t('gameCreator.sceneScripts')}</h2>
            </div>

            <p className="mb-3 text-xs text-gray-500">{t('gameCreator.scenesHint')}</p>

            {/* Visual plug-&-play scenes editor (Easy mode) + Advanced JSON tab.
                scenesJson remains the single source of truth. */}
            <SceneEditor
              scenesJson={scenesJson}
              onJsonChange={handleScenesChange}
            />

            {scenesError && (
              <p className="mt-2 text-xs text-red-500">{t('gameCreator.invalidJson', { error: scenesError })}</p>
            )}

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.back')}
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!canStep4}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d76] disabled:opacity-40 active:scale-95 transition-all"
              >
                <Eye className="h-4 w-4" /> {t('gameCreator.reviewSubmit')}
              </button>
            </div>
          </div>
        )}

        {/* ────────────── Step 4: Review ────────────── */}
        {step === 4 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Eye className="h-5 w-5 text-[#0F4D92]" />
              <h2 className="text-base font-bold text-gray-800">{t('gameCreator.reviewSubmit')}</h2>
            </div>

            <div className="space-y-3 mb-6">
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-500">{t('gameCreator.review.title')}</span>
                    <p className="font-medium text-gray-800">{title}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">{t('gameCreator.review.subject')}</span>
                    <p className="font-medium text-gray-800">{subject}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">{t('gameCreator.review.ageLevel')}</span>
                    <p className="font-medium text-gray-800">{ageLevel}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">{t('gameCreator.review.template')}</span>
                    <p className="font-medium text-gray-800">{TEMPLATES.find(t => t.id === template) ? t(TEMPLATES.find(t => t.id === template)!.labelKey) : template}</p>
                  </div>
                </div>
                {lessonText && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <span className="text-xs text-gray-500">{t('gameCreator.review.lessonText')}</span>
                    <p className="text-sm text-gray-700">{lessonText}</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">{t('gameCreator.review.gameConfig')}</span>
                  <span className="text-xs text-gray-400">
                    {(() => { try { return JSON.parse(configJson) ? t('gameCreator.valid') : t('gameCreator.invalid'); } catch { return t('gameCreator.invalid'); } })()}
                  </span>
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-white border border-gray-200 p-3 text-xs font-mono text-gray-700">
                  {configJson.length > 1500 ? configJson.slice(0, 1500) + '\n... (truncated)' : configJson}
                </pre>
              </div>

              {scenesJson.trim() && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <span className="text-xs font-medium text-gray-600">{t('gameCreator.sceneScripts')}</span>
                  <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-white border border-gray-200 p-3 text-xs font-mono text-gray-700">
                    {scenesJson.length > 500 ? scenesJson.slice(0, 500) + '\n... (truncated)' : scenesJson}
                  </pre>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-6">
              <p className="text-xs text-blue-700">{t('gameCreator.pendingNote')}</p>
            </div>

            <div className="flex justify-between items-center gap-2">
              <button
                onClick={() => setStep(3)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <ArrowLeft className="h-4 w-4" /> {t('common.back')}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    let config: any = {};
                    let scenes: any = [];
                    try { config = JSON.parse(configJson); } catch {}
                    try {
                      const s = JSON.parse(scenesJson);
                      if (Array.isArray(s)) scenes = s;
                      else if (s?.scenes) scenes = Array.isArray(s.scenes) ? s.scenes : [s];
                    } catch {}
                    navigate('/teacher/preview-draft', { state: { config, scenes } });
                  }}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  <Eye className="h-4 w-4" /> {t('gameCreator.testPlay')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t('teacher.lessons.creating')}</>
                  ) : (
                    <><Send className="h-4 w-4" /> {t('gameCreator.submitForReview')}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ────────────── Step 5: Success ────────────── */}
        {step === 5 && result && (
          <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">{t('gameCreator.successTitle')}</h2>
            <p className="text-sm text-gray-500 mb-6">{t('gameCreator.successBody')}</p>

            <div className="rounded-xl bg-gray-50 p-4 mb-6 text-left">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-gray-500">{t('gameCreator.lessonId')}</span>
                  <p className="font-mono text-xs text-gray-700 truncate">{result.lesson_id}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">{t('gameCreator.configId')}</span>
                  <p className="font-mono text-xs text-gray-700 truncate">{result.config_id}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-3 flex-wrap">
              <button
                onClick={() => navigate(`/teacher/preview/${result.lesson_id}?preview=1`)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition-all"
              >
                <Eye className="h-4 w-4" /> {t('gameCreator.previewGame')}
              </button>
              <button
                onClick={() => navigate('/teacher/lessons')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d76] active:scale-95 transition-all"
              >
                <BookOpen className="h-4 w-4" /> {t('gameCreator.viewLessons')}
              </button>
              <button
                onClick={() => {
                  setTitle(''); setSubject(''); setAgeLevel('KG1'); setLessonText('');
                  setTemplate(''); setConfigJson(''); setScenesJson(''); setResult(null);
                  setStep(0);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
              >
                <Wand2 className="h-4 w-4" /> {t('gameCreator.createAnother')}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
