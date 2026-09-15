/**
 * Jump-ahead checkpoint ("test out") — API shapes.
 *
 * Mirrors backend/src/controllers/kidsCheckpoints.js. A checkpoint covers every
 * unfinished level a subject has up to the child's band ceiling; the same games
 * are played by every school, and only the SCHOOL decides who may confirm the
 * unlock (a teacher/admin, or the platform itself in a self-paced school).
 *
 * The server never sends an answer key, so `CorrectId` is absent on purpose —
 * grading happens server-side against the issued set.
 */

export type CheckpointStatus = 'issued' | 'submitted' | 'approved' | 'rejected';

export interface CheckpointOption {
  id: string;
  label: string;
  emoji?: string;
  image?: string;
  color?: string;
  audio?: string;
}

export interface CheckpointQuestion {
  id: string;
  unit_id: string | null;
  unit_number?: number | null;
  lesson_id: string | null;
  lesson_title?: string | null;
  template?: string;
  question: string;
  speechText?: string | null;
  options: CheckpointOption[];
}

export interface CheckpointUnitSummary {
  unit_id: string;
  unit_number?: number | null;
  title?: string | null;
}

export interface CheckpointExam {
  id: string;
  series_id: string;
  band?: string | null;
  /** The attempt's school — the party whose privilege decides the confirmer. */
  school_id?: string | null;
  status: CheckpointStatus;
  score_pct?: number | null;
  threshold_pct?: number;
  self_approved?: boolean;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  submitted_at?: string | null;
  asked_count?: number;
  unit_ids?: string[];
  units?: CheckpointUnitSummary[];
  /** The issued questions (answer key stripped). Only on an open attempt. */
  questions?: CheckpointQuestion[];
  /** True when a person must confirm; false in a self-paced school. */
  requires_confirmation?: boolean;
  awaiting_review?: boolean;
  resumed?: boolean;
  eligible?: boolean;
  reason?: string | null;
  /** How little the assessment asked — surfaced to the reviewer, not a block. */
  thin?: boolean;
  max_questions?: number;
  can_retry_at?: string | null;
  retry_after?: string | null;
  exempt_units?: string[];
  lessons_exempted?: number;
  stars_awarded?: number;
  xp_awarded?: number;
  per_unit?: Record<string, { asked: number; correct: number }>;
}

export interface CheckpointStatusPayload {
  threshold_pct: number;
  exams: CheckpointExam[];
}

export interface CheckpointQueueItem extends CheckpointExam {
  child_admission_no: string;
  units: CheckpointUnitSummary[];
}

export interface CheckpointQueuePayload {
  threshold_pct: number;
  pending: number;
  items: CheckpointQueueItem[];
}

/**
 * Who may confirm a jump-ahead. Resolved child → class → school → platform
 * default, most specific wins, so a school can stay supervised overall and still
 * let a selected child skip ahead (or hold one child back under review).
 */
export type CheckpointPolicyScope = 'school' | 'class' | 'child';

export interface CheckpointPolicy {
  auto_approve: boolean;
  source: CheckpointPolicyScope | 'platform_self_paced' | 'platform_default';
  scope_id: string | null;
  note?: string | null;
  set_by?: string | null;
}

export interface CheckpointPolicyOverride {
  scope: CheckpointPolicyScope;
  scope_id: string;
  auto_approve: boolean;
  set_by?: string | null;
  note?: string | null;
  updated_at?: string | null;
}

export interface CheckpointPolicyPayload {
  student_id?: string;
  school_id?: string | null;
  class_code?: string | null;
  effective?: CheckpointPolicy;
  overrides?: Record<string, CheckpointPolicyOverride>;
}
