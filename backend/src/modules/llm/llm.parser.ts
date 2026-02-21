/**
 * Парсинг и валидация ответа LLM.
 */

import { LlmAnalysis } from './llm.types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function parseTaskClassification(
  value: unknown,
): LlmAnalysis['taskClassification'] {
  const fallback = {
    businessCritical: [],
    technicallySignificant: [],
    bugfixes: [],
    other: [],
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const obj = value as Record<string, unknown>;

  return {
    businessCritical: asStringArray(obj.businessCritical),
    technicallySignificant: asStringArray(obj.technicallySignificant),
    bugfixes: asStringArray(obj.bugfixes),
    other: asStringArray(obj.other),
  };
}

function extractJson(raw: string): string | null {
  // Try to find JSON object in the text
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function validateAndNormalize(obj: Record<string, unknown>): LlmAnalysis | null {
  // Score is required and must be numeric
  const rawScore = obj.score;
  if (rawScore == null || typeof rawScore !== 'number') {
    return null;
  }

  const score = clamp(Math.round(rawScore), 0, 100);

  let summary = typeof obj.summary === 'string' ? obj.summary : '';
  if (summary.length > 1000) {
    summary = summary.slice(0, 1000);
  }

  return {
    score,
    summary,
    achievements: asStringArray(obj.achievements),
    concerns: asStringArray(obj.concerns),
    recommendations: asStringArray(obj.recommendations),
    taskClassification: parseTaskClassification(obj.taskClassification),
  };
}

export function parseLlmResponse(raw: string): LlmAnalysis | null {
  if (!raw || raw.trim().length === 0) return null;

  // 1. Try direct JSON.parse
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return validateAndNormalize(parsed);
  } catch {
    // Not valid JSON, try extraction
  }

  // 2. Try to extract JSON from text
  const jsonStr = extractJson(raw);
  if (!jsonStr) return null;

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return validateAndNormalize(parsed);
  } catch {
    return null;
  }
}
