'use strict';

/**
 * Runtime feature flags for practical-first deployments.
 *
 * Defaults intentionally preserve existing behavior. A zero-funding pilot can
 * set selected KIDS_*_ENABLED variables to 0 without removing code, routes or
 * historical data.
 */

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function enabled(name, defaultValue = true, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const value = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return defaultValue;
}

const FLAGS = Object.freeze({
  realtime: 'KIDS_REALTIME_ENABLED',
  aiGeneration: 'KIDS_AI_GENERATION_ENABLED',
  mediaWorkers: 'KIDS_MEDIA_WORKERS_ENABLED',
  social: 'KIDS_SOCIAL_ENABLED',
  intelligence: 'KIDS_INTELLIGENCE_ENABLED',
  push: 'KIDS_PUSH_ENABLED',
  marketplace: 'KIDS_MARKETPLACE_ENABLED',
  smsContextBridge: 'SMS_CONTEXT_BRIDGE_ENABLED',
  smsContextBridgeSchools: 'SMS_CONTEXT_BRIDGE_SCHOOLS',
  flagshipPilot: 'KIDS_FLAGSHIP_PILOT_ENABLED',
  flagshipPilotSchools: 'KIDS_FLAGSHIP_PILOT_SCHOOLS',
});

function isFeatureEnabled(feature, defaultValue = true, env = process.env) {
  const name = FLAGS[feature] || feature;
  return enabled(name, defaultValue, env);
}

/**
 * The SMS bridge is a controlled rollout, not a global switch. In production,
 * enabling the feature also requires an explicit comma-separated school
 * allow-list. Non-production callers may use the boolean flag for fixtures.
 */
function isSmsContextBridgeEnabled(schoolId, env = process.env) {
  if (!isFeatureEnabled('smsContextBridge', false, env)) return false;
  const schools = String(env[FLAGS.smsContextBridgeSchools] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (schools.length === 0) return env.NODE_ENV !== 'production';
  return schools.includes(String(schoolId || '').trim());
}

/**
 * Controlled flagship pilot policy. The pilot is opt-in even for the model
 * school: this prevents a future flagship or staging tenant from silently
 * bypassing the normal approval queue. A school must be present in the
 * explicit allow-list and the feature flag must be true.
 */
function isFlagshipPilotEnabled(schoolId, env = process.env) {
  if (!isFeatureEnabled('flagshipPilot', false, env)) return false;
  const flagshipIds = new Set(['SCH-ELITE', 'SCH-KIDS']);
  const requestedSchool = String(schoolId || '').trim();
  if (!flagshipIds.has(requestedSchool)) return false;
  // No implicit default: production must name the approved pilot school
  // explicitly so a future flagship tenant cannot inherit publish behavior.
  const schools = String(env[FLAGS.flagshipPilotSchools] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return schools.includes(requestedSchool);
}

function isPilotValidationComplete(body = {}) {
  return ['played', 'story_checked', 'game_checked', 'safety_checked']
    .every((field) => body[field] === true);
}

function pausedResponse(feature) {
  return {
    success: false,
    error_code: 'FEATURE_PAUSED',
    feature,
    message: 'This optional feature is paused while the learning service is running in practical-first mode.',
  };
}

module.exports = {
  FLAGS,
  enabled,
  isFeatureEnabled,
  isSmsContextBridgeEnabled,
  isFlagshipPilotEnabled,
  isPilotValidationComplete,
  pausedResponse,
};
