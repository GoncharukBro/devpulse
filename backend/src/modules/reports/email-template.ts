/**
 * Генерация Outlook-совместимых HTML-писем для email-отчётов.
 *
 * Правила: только table layout, только inline styles, Arial/Helvetica,
 * ширина 600px, hex-цвета, cellpadding/cellspacing, border-collapse.
 */

// ─── Интерфейсы данных ─────────────────────────────────────────────

export interface EmployeeEmailData {
  employee: { displayName: string; login: string };
  project: string;
  period: { start: string; end: string };
  score: number | null;
  prevScore: number | null;
  kpis: {
    utilization: number | null;
    estimationAccuracy: number | null;
    focus: number | null;
    completionRate: number | null;
    avgComplexity: number | null;
    avgCycleTimeHours: number | null;
  };
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    byType: Record<string, number>;
  };
  time: {
    spentHours: number;
    estimationHours: number;
  };
  llm: {
    summary: string | null;
    achievements: string[];
    concerns: string[];
    recommendations: string[];
  } | null;
  nftAchievements: Array<{ icon: string; title: string; rarity: string }>;
}

export interface ProjectEmailData {
  project: { name: string; shortName: string };
  period: { start: string; end: string };
  avgScore: number | null;
  prevAvgScore: number | null;
  employeeCount: number;
  employees: Array<{
    displayName: string;
    score: number | null;
    utilization: number | null;
    completedIssues: number;
    totalIssues: number;
  }>;
  concerns: Array<{ displayName: string; reasons: string[] }>;
  recommendations: string[];
}

export interface TeamEmailData {
  team: { name: string };
  period: { start: string; end: string };
  avgScore: number | null;
  prevAvgScore: number | null;
  memberCount: number;
  members: Array<{
    displayName: string;
    projectName: string;
    score: number | null;
    utilization: number | null;
    completionRate: number | null;
    estimationAccuracy: number | null;
  }>;
  concerns: Array<{ displayName: string; reasons: string[] }>;
  achievements: Array<{ icon: string; title: string; rarity: string; displayName: string }>;
}

// ─── Хелперы ────────────────────────────────────────────────────────

function getScoreColor(score: number | null): string {
  if (score === null) return '#6b7280';
  if (score >= 70) return '#059669';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function getScoreBg(score: number | null): string {
  if (score === null) return '#f9fafb';
  if (score >= 70) return '#ecfdf5';
  if (score >= 50) return '#fffbeb';
  return '#fef2f2';
}

interface KpiStatus {
  color: string;
  label: string;
  bgColor: string;
}

function getKpiStatus(value: number | null, type: string): KpiStatus {
  if (value === null) {
    return { color: '#6b7280', label: '—', bgColor: '#f9fafb' };
  }

  const thresholds: Record<string, { good: number; warn: number; inverse?: boolean }> = {
    utilization: { good: 75, warn: 50 },
    estimationAccuracy: { good: 70, warn: 50 },
    focus: { good: 70, warn: 50 },
    completionRate: { good: 70, warn: 50 },
  };

  const t = thresholds[type];
  if (!t) {
    return { color: '#374151', label: '', bgColor: '#f9fafb' };
  }

  if (value >= t.good) {
    return { color: '#059669', label: '\u2713 Норма', bgColor: '#f0fdf4' };
  }
  if (value >= t.warn) {
    return { color: '#d97706', label: '\u26a0 Ниже нормы', bgColor: '#fffbeb' };
  }
  return { color: '#dc2626', label: '\u2717 Проблема', bgColor: '#fef2f2' };
}

const MONTHS_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

function formatPeriodRu(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sDay = s.getUTCDate();
  const eDay = e.getUTCDate();
  const sMonth = MONTHS_RU[s.getUTCMonth()];
  const eMonth = MONTHS_RU[e.getUTCMonth()];
  const eYear = e.getUTCFullYear();

  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${sDay}\u2013${eDay} ${eMonth} ${eYear}`;
  }
  return `${sDay} ${sMonth} \u2013 ${eDay} ${eMonth} ${eYear}`;
}

function round1(v: number | null): string {
  if (v === null) return '\u2014';
  return String(Math.round(v * 10) / 10);
}

function pct(v: number | null): string {
  if (v === null) return '\u2014';
  return `${Math.round(v * 10) / 10}%`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const RARITY_COLORS: Record<string, string> = {
  legendary: '#ca8a04',
  epic: '#7c3aed',
  rare: '#2563eb',
  common: '#6b7280',
};

const RARITY_LABELS: Record<string, string> = {
  legendary: 'LEGENDARY',
  epic: 'EPIC',
  rare: 'RARE',
  common: 'COMMON',
};

function getTrendHtml(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return '';
  const diff = Math.round((current - prev) * 10) / 10;
  if (diff > 0) {
    return `<span style="color:#059669;font-size:13px;">\u25b2 +${diff} к прошлой неделе</span>`;
  }
  if (diff < 0) {
    return `<span style="color:#dc2626;font-size:13px;">\u25bc ${diff} к прошлой неделе</span>`;
  }
  return `<span style="color:#6b7280;font-size:13px;">\u2192 Стабильно</span>`;
}

// ─── Базовая обёртка ────────────────────────────────────────────────

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;">
${bodyHtml}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Блоки (shared) ─────────────────────────────────────────────────

function headerBlock(params: {
  periodText: string;
  subtitle: string;
  title: string;
  extra?: string;
}): string {
  return `<tr><td style="background-color:#1e1b4b;border-radius:12px 12px 0 0;padding:28px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="font-size:22px;font-weight:bold;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">DevPulse</td>
<td align="right" style="font-size:13px;color:#a5b4fc;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(params.periodText)}</td>
</tr>
<tr><td colspan="2" style="padding-top:16px;">
<div style="font-size:13px;color:#c7d2fe;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(params.subtitle)}</div>
<div style="font-size:20px;font-weight:bold;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding-top:4px;">${escapeHtml(params.title)}</div>
${params.extra ? `<div style="font-size:14px;color:#a5b4fc;font-family:Arial,Helvetica,sans-serif;padding-top:2px;">${escapeHtml(params.extra)}</div>` : ''}
</td></tr>
</table>
</td></tr>`;
}

function scoreBlock(score: number | null, prev: number | null, label: string): string {
  const bg = getScoreBg(score);
  const color = getScoreColor(score);
  const scoreText = score !== null ? String(Math.round(score)) : '\u2014';
  const subLabel = score === null ? 'Нет данных' : '';
  const trend = getTrendHtml(score, prev);

  return `<tr><td style="background-color:#ffffff;padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tr><td style="background-color:${bg};padding:24px 32px;text-align:center;">
<div style="font-size:13px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(label)}</div>
<div style="font-size:52px;font-weight:bold;color:${color};font-family:Arial,Helvetica,sans-serif;padding:8px 0;">${scoreText}</div>
${subLabel ? `<div style="font-size:13px;color:#9ca3af;font-family:Arial,Helvetica,sans-serif;">${subLabel}</div>` : ''}
${trend ? `<div style="padding-top:4px;">${trend}</div>` : ''}
</td></tr>
</table>
</td></tr>`;
}

function kpiGrid(kpis: {
  utilization: number | null;
  estimationAccuracy: number | null;
  focus: number | null;
  completionRate: number | null;
}): string {
  const items = [
    { label: 'Загрузка', value: kpis.utilization, type: 'utilization', suffix: '%' },
    { label: 'Точность оценок', value: kpis.estimationAccuracy, type: 'estimationAccuracy', suffix: '%' },
    { label: 'Фокус', value: kpis.focus, type: 'focus', suffix: '%' },
    { label: 'Скорость закр.', value: kpis.completionRate, type: 'completionRate', suffix: '%' },
  ];

  function kpiCell(item: typeof items[0]): string {
    const status = getKpiStatus(item.value, item.type);
    const valStr = item.value !== null ? `${Math.round(item.value * 10) / 10}${item.suffix}` : '\u2014';
    return `<td width="50%" style="background-color:${status.bgColor};padding:16px 20px;border:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;" valign="top">
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(item.label)}</div>
<div style="font-size:24px;font-weight:bold;color:${status.color};padding:4px 0;">${valStr}</div>
<div style="font-size:11px;color:${status.color};">${escapeHtml(status.label)}</div>
</td>`;
  }

  return `<tr><td style="background-color:#ffffff;padding:0 32px 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tr>${kpiCell(items[0])}${kpiCell(items[1])}</tr>
<tr>${kpiCell(items[2])}${kpiCell(items[3])}</tr>
</table>
</td></tr>`;
}

function sectionTitle(text: string): string {
  return `<div style="font-size:15px;font-weight:bold;color:#1f2937;font-family:Arial,Helvetica,sans-serif;padding-bottom:12px;">${escapeHtml(text)}</div>`;
}

function tasksBlock(tasks: {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  byType: Record<string, number>;
}): string {
  const completedColor = tasks.total > 0 && tasks.completed / tasks.total > 0.7 ? '#059669' : '#374151';
  const overdueColor = tasks.overdue > 0 ? '#dc2626' : '#374151';

  const typeLabels: Record<string, string> = {
    feature: 'Фичи',
    bugfix: 'Баги',
    bug: 'Баги',
    tech_debt: 'Техдолг',
    techdebt: 'Техдолг',
    support: 'Поддержка',
    documentation: 'Документация',
    code_review: 'Code Review',
    other: 'Прочее',
  };

  const typeEntries = Object.entries(tasks.byType)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${typeLabels[k] ?? k}: ${v}`)
    .join(' \u00b7 ');

  return `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('Задачи за период')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tr>
<td width="25%" align="center" style="padding:8px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Всего</div>
<div style="font-size:20px;font-weight:bold;color:#374151;padding-top:4px;">${tasks.total}</div>
</td>
<td width="25%" align="center" style="padding:8px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Закрыто</div>
<div style="font-size:20px;font-weight:bold;color:${completedColor};padding-top:4px;">${tasks.completed}</div>
</td>
<td width="25%" align="center" style="padding:8px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;">В работе</div>
<div style="font-size:20px;font-weight:bold;color:#374151;padding-top:4px;">${tasks.inProgress}</div>
</td>
<td width="25%" align="center" style="padding:8px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Просрочено</div>
<div style="font-size:20px;font-weight:bold;color:${overdueColor};padding-top:4px;">${tasks.overdue}</div>
</td>
</tr>
</table>
${typeEntries ? `<div style="font-size:13px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;padding-top:8px;">По типам: ${escapeHtml(typeEntries)}</div>` : ''}
</td></tr>`;
}

function timeBlock(time: {
  spentHours: number;
  estimationHours: number;
}, kpis: {
  avgComplexity: number | null;
  avgCycleTimeHours: number | null;
}): string {
  return `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('Учёт времени')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;">
<tr><td style="padding:3px 16px 3px 0;">Списано:</td><td style="font-weight:bold;">${round1(time.spentHours)}ч</td></tr>
<tr><td style="padding:3px 16px 3px 0;">Оценка:</td><td style="font-weight:bold;">${round1(time.estimationHours)}ч</td></tr>
${kpis.avgComplexity !== null ? `<tr><td style="padding:3px 16px 3px 0;">Средняя сложность:</td><td style="font-weight:bold;">${round1(kpis.avgComplexity)}ч</td></tr>` : ''}
${kpis.avgCycleTimeHours !== null ? `<tr><td style="padding:3px 16px 3px 0;">Cycle Time:</td><td style="font-weight:bold;">${round1(kpis.avgCycleTimeHours)}ч</td></tr>` : ''}
</table>
</td></tr>`;
}

function llmBlock(llm: {
  summary: string | null;
  achievements: string[];
  concerns: string[];
  recommendations: string[];
}): string {
  if (!llm.summary && llm.achievements.length === 0 && llm.recommendations.length === 0) {
    return '';
  }

  let html = `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('\ud83e\udd16 ИИ-анализ')}`;

  if (llm.summary) {
    html += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
<tr>
<td style="border-left:3px solid #6366f1;background-color:#f5f3ff;padding:12px 16px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">
${escapeHtml(llm.summary)}
</td>
</tr>
</table>`;
  }

  if (llm.achievements.length > 0) {
    html += `<div style="font-size:13px;font-weight:bold;color:#374151;font-family:Arial,Helvetica,sans-serif;padding:8px 0 4px;">Ключевые достижения:</div>`;
    for (const a of llm.achievements) {
      html += `<div style="font-size:13px;color:#059669;font-family:Arial,Helvetica,sans-serif;padding:2px 0 2px 12px;">\u2022 ${escapeHtml(a)}</div>`;
    }
  }

  if (llm.recommendations.length > 0) {
    html += `<div style="font-size:13px;font-weight:bold;color:#374151;font-family:Arial,Helvetica,sans-serif;padding:8px 0 4px;">Рекомендации:</div>`;
    for (const r of llm.recommendations) {
      html += `<div style="font-size:13px;color:#4f46e5;font-family:Arial,Helvetica,sans-serif;padding:2px 0 2px 12px;">\u2022 ${escapeHtml(r)}</div>`;
    }
  }

  html += `</td></tr>`;
  return html;
}

function concernsBlock(concerns: Array<{ displayName: string; reasons: string[] }>): string {
  if (concerns.length === 0) return '';

  let html = `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('\u26a0 Обратить внимание')}`;

  for (const c of concerns) {
    const reasonsText = c.reasons.join('; ');
    html += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
<tr>
<td style="border-left:3px solid #dc2626;background-color:#fef2f2;padding:10px 14px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
<strong>${escapeHtml(c.displayName)}</strong>: ${escapeHtml(reasonsText)}
</td>
</tr>
</table>`;
  }

  html += `</td></tr>`;
  return html;
}

function employeeConcernsBlock(concerns: string[]): string {
  if (concerns.length === 0) return '';

  let html = `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('\u26a0 Обратить внимание')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
<tr>
<td style="border-left:3px solid #dc2626;background-color:#fef2f2;padding:10px 14px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">`;

  for (const c of concerns) {
    html += `${escapeHtml(c)}<br>`;
  }

  html += `</td></tr></table></td></tr>`;
  return html;
}

function achievementsBlock(achievements: Array<{ icon: string; title: string; rarity: string }>, title?: string): string {
  if (achievements.length === 0) return '';

  let html = `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle(title ?? '\ud83c\udfc6 Достижения за период')}`;

  for (const a of achievements) {
    const rarityColor = RARITY_COLORS[a.rarity] ?? '#6b7280';
    const rarityLabel = RARITY_LABELS[a.rarity] ?? a.rarity.toUpperCase();
    html += `<div style="font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif;padding:4px 0;">
${a.icon} ${escapeHtml(a.title)} <span style="color:${rarityColor};font-size:11px;font-weight:bold;">(${rarityLabel})</span>
</div>`;
  }

  html += `</td></tr>`;
  return html;
}

function teamAchievementsBlock(achievements: Array<{ icon: string; title: string; rarity: string; displayName: string }>): string {
  if (achievements.length === 0) return '';

  let html = `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('\ud83c\udfc6 Достижения за период')}`;

  for (const a of achievements) {
    const rarityColor = RARITY_COLORS[a.rarity] ?? '#6b7280';
    const rarityLabel = RARITY_LABELS[a.rarity] ?? a.rarity.toUpperCase();
    html += `<div style="font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif;padding:4px 0;">
${a.icon} ${escapeHtml(a.title)} <span style="color:${rarityColor};font-size:11px;font-weight:bold;">(${rarityLabel})</span> \u2014 ${escapeHtml(a.displayName)}
</div>`;
  }

  html += `</td></tr>`;
  return html;
}

function footerBlock(): string {
  const now = new Date();
  const dateStr = `${now.getDate()} ${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`;

  return `<tr><td style="background-color:#f9fafb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
<div style="font-size:12px;color:#9ca3af;font-family:Arial,Helvetica,sans-serif;">
Сформировано: DevPulse \u00b7 ${dateStr}
</div>
</td></tr>`;
}

function dividerRow(): string {
  return `<tr><td style="background-color:#ffffff;padding:0 32px;"><div style="border-top:1px solid #e5e7eb;"></div></td></tr>`;
}

// ─── Генератор: Сотрудник ───────────────────────────────────────────

export function generateEmployeeEmailHtml(data: EmployeeEmailData): string {
  const periodText = formatPeriodRu(data.period.start, data.period.end);

  const parts: string[] = [];

  // 1. Header
  parts.push(headerBlock({
    periodText,
    subtitle: 'Отчёт о продуктивности',
    title: data.employee.displayName,
    extra: data.project,
  }));

  // 2. Score
  parts.push(scoreBlock(data.score, data.prevScore, 'Оценка продуктивности'));

  // 3. KPI grid
  parts.push(kpiGrid({
    utilization: data.kpis.utilization,
    estimationAccuracy: data.kpis.estimationAccuracy,
    focus: data.kpis.focus,
    completionRate: data.kpis.completionRate,
  }));

  // 4. Tasks
  parts.push(dividerRow());
  parts.push(tasksBlock(data.tasks));

  // 5. Time
  parts.push(dividerRow());
  parts.push(timeBlock(data.time, {
    avgComplexity: data.kpis.avgComplexity,
    avgCycleTimeHours: data.kpis.avgCycleTimeHours,
  }));

  // 6. LLM
  if (data.llm) {
    parts.push(dividerRow());
    parts.push(llmBlock(data.llm));
  }

  // 7. Concerns
  if (data.llm && data.llm.concerns.length > 0) {
    parts.push(dividerRow());
    parts.push(employeeConcernsBlock(data.llm.concerns));
  }

  // 8. Achievements
  if (data.nftAchievements.length > 0) {
    parts.push(dividerRow());
    parts.push(achievementsBlock(data.nftAchievements));
  }

  // 9. Footer
  parts.push(footerBlock());

  const subject = `DevPulse \u00b7 ${data.employee.displayName} \u00b7 ${periodText}`;
  return wrapHtml(subject, parts.join('\n'));
}

// ─── Генератор: Проект ──────────────────────────────────────────────

export function generateProjectEmailHtml(data: ProjectEmailData): string {
  const periodText = formatPeriodRu(data.period.start, data.period.end);

  const parts: string[] = [];

  // 1. Header
  parts.push(headerBlock({
    periodText,
    subtitle: 'Отчёт по проекту',
    title: data.project.name,
    extra: `${data.employeeCount} сотрудников`,
  }));

  // 2. Score
  parts.push(scoreBlock(data.avgScore, data.prevAvgScore, 'Средняя оценка команды'));

  // 3. Employee table
  parts.push(`<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('Сотрудники')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tr style="background-color:#f9fafb;">
<td style="padding:8px 12px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Сотрудник</td>
<td align="center" style="padding:8px 12px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Score</td>
<td align="center" style="padding:8px 12px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Загрузка</td>
<td align="center" style="padding:8px 12px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Закрыто</td>
</tr>`);

  for (const emp of data.employees) {
    const scoreColor = getScoreColor(emp.score);
    const utilColor = getScoreColor(emp.utilization !== null && emp.utilization >= 70 ? 70 : emp.utilization);
    parts.push(`<tr>
<td style="padding:8px 12px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${escapeHtml(emp.displayName)}</td>
<td align="center" style="padding:8px 12px;font-size:13px;font-weight:bold;color:${scoreColor};font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${emp.score !== null ? Math.round(emp.score) : '\u2014'}</td>
<td align="center" style="padding:8px 12px;font-size:13px;color:${utilColor};font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${pct(emp.utilization)}</td>
<td align="center" style="padding:8px 12px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${emp.completedIssues}/${emp.totalIssues}</td>
</tr>`);
  }

  parts.push(`</table></td></tr>`);

  // 4. Concerns
  if (data.concerns.length > 0) {
    parts.push(dividerRow());
    parts.push(concernsBlock(data.concerns));
  }

  // 5. Recommendations
  if (data.recommendations.length > 0) {
    parts.push(dividerRow());
    let recsHtml = `<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('Рекомендации')}`;
    for (const r of data.recommendations) {
      recsHtml += `<div style="font-size:13px;color:#4f46e5;font-family:Arial,Helvetica,sans-serif;padding:2px 0 2px 12px;">\u2022 ${escapeHtml(r)}</div>`;
    }
    recsHtml += `</td></tr>`;
    parts.push(recsHtml);
  }

  // 6. Footer
  parts.push(footerBlock());

  return wrapHtml(`DevPulse \u00b7 ${data.project.name} \u00b7 ${periodText}`, parts.join('\n'));
}

// ─── Генератор: Команда ─────────────────────────────────────────────

export function generateTeamEmailHtml(data: TeamEmailData): string {
  const periodText = formatPeriodRu(data.period.start, data.period.end);

  const parts: string[] = [];

  // 1. Header
  parts.push(headerBlock({
    periodText,
    subtitle: 'Отчёт по команде',
    title: data.team.name,
    extra: `${data.memberCount} участников`,
  }));

  // 2. Score
  parts.push(scoreBlock(data.avgScore, data.prevAvgScore, 'Средняя оценка команды'));

  // 3. Members table
  parts.push(`<tr><td style="background-color:#ffffff;padding:20px 32px;">
${sectionTitle('Сотрудники команды')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tr style="background-color:#f9fafb;">
<td style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Сотрудник</td>
<td style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Проект</td>
<td align="center" style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Score</td>
<td align="center" style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:bold;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #e5e7eb;">Загрузка</td>
</tr>`);

  for (const m of data.members) {
    const scoreColor = getScoreColor(m.score);
    const utilColor = getScoreColor(m.utilization !== null && m.utilization >= 70 ? 70 : m.utilization);
    parts.push(`<tr>
<td style="padding:8px 10px;font-size:13px;color:#374151;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${escapeHtml(m.displayName)}</td>
<td style="padding:8px 10px;font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${escapeHtml(m.projectName)}</td>
<td align="center" style="padding:8px 10px;font-size:13px;font-weight:bold;color:${scoreColor};font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${m.score !== null ? Math.round(m.score) : '\u2014'}</td>
<td align="center" style="padding:8px 10px;font-size:13px;color:${utilColor};font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${pct(m.utilization)}</td>
</tr>`);
  }

  parts.push(`</table></td></tr>`);

  // 4. Concerns
  if (data.concerns.length > 0) {
    parts.push(dividerRow());
    parts.push(concernsBlock(data.concerns));
  }

  // 5. Achievements
  if (data.achievements.length > 0) {
    parts.push(dividerRow());
    parts.push(teamAchievementsBlock(data.achievements));
  }

  // 6. Footer
  parts.push(footerBlock());

  return wrapHtml(`DevPulse \u00b7 ${data.team.name} \u00b7 ${periodText}`, parts.join('\n'));
}

// ─── Генерация subject ──────────────────────────────────────────────

export function generateSubject(
  type: 'employee' | 'project' | 'team',
  name: string,
  periodStart: string,
  periodEnd: string,
): string {
  const periodText = formatPeriodRu(periodStart, periodEnd);
  return `DevPulse \u00b7 ${name} \u00b7 ${periodText}`;
}
