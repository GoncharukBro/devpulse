import { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function MethodologyPage() {
  usePageTitle('Методология');
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hash]);

  return (
    <>
      <PageHeader
        title="Методология"
        description="Как работает DevPulse — источники данных, метрики и их расчёт"
      />

      <div className="space-y-6">
        {/* 1. Как работает система */}
        <section id="how-it-works">
          <Card header={<SectionHeader emoji="⚙️" title="Как работает система" />}>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              DevPulse автоматически собирает данные из YouTrack раз в неделю:
              задачи, списания времени, статусы. На основе этих данных рассчитываются
              ключевые показатели по каждому сотруднику и проекту.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              AI-модель анализирует метрики и формирует текстовую сводку
              с оценкой, достижениями и рекомендациями.
            </p>
          </Card>
        </section>

        {/* 2. Источники данных */}
        <section id="data-sources">
          <Card header={<SectionHeader emoji="🔌" title="Источники данных" />}>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              Все данные берутся из YouTrack через API:
            </p>
            <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Задачи</strong> — тип, статус, исполнитель, оценка, даты создания и закрытия</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Списания времени</strong> (work items) — кто, сколько, когда, тип работы</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Участники проекта</strong> — для определения состава команды</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              DevPulse только читает данные. Система не создаёт, не изменяет и не удаляет задачи в YouTrack.
            </p>
          </Card>
        </section>

        {/* 3. Ключевые метрики */}
        <section id="metrics">
          <Card header={<SectionHeader emoji="📊" title="Ключевые метрики" />}>
            <div className="space-y-4">
              <MetricBlock
                title="Загрузка (Utilization)"
                description="Насколько загружен сотрудник относительно 40-часовой рабочей недели."
                formula="(списанное время / 40 часов) × 100%"
                thresholds={{ good: '60–100%', warning: '40–59% или 101–120%', danger: '< 40% или > 120%' }}
                na="если нет списаний — 0% (валидное значение)"
              />
              <MetricBlock
                title="Точность оценок (Estimation Accuracy)"
                description="Насколько точно сотрудник оценивает сроки задач."
                formula="min(оценка, факт) / max(оценка, факт) × 100%"
                thresholds={{ good: '≥ 75%', warning: '55–74%', danger: '< 55%' }}
                na="если нет задач с оценкой и фактом"
              />
              <MetricBlock
                title="Фокус (Focus)"
                description="Доля времени на продуктовые задачи (фичи, техдолг, документация) от общего списанного времени."
                formula="(время на фичи + техдолг + docs) / общее время × 100%"
                thresholds={{ good: '≥ 65%', warning: '45–64%', danger: '< 45%' }}
                na="если нет списаний"
              />
              <MetricBlock
                title="Закрытие (Completion Rate)"
                description="Процент завершённых задач от общего количества за период."
                formula="завершённые / всего × 100%"
                thresholds={{ good: '≥ 70%', warning: '50–69%', danger: '< 50%' }}
                na="если нет задач"
              />
              <MetricBlock
                title="Cycle Time"
                description="Среднее время от взятия задачи в работу до её закрытия."
                formula='среднее(дата закрытия − дата начала работы)'
                thresholds={{ good: '≤ 48 ч', warning: '49–96 ч', danger: '> 96 ч' }}
                na="если нет закрытых задач с историей статусов"
              />
              <MetricBlock
                title="Списано часов"
                description="Суммарное время, списанное сотрудником за неделю (work items из YouTrack)."
                formula="сумма всех списаний за период"
                thresholds={{ good: '30–45 ч', warning: '20–29 ч или 46–55 ч', danger: '< 20 ч или > 55 ч' }}
                na="если нет списаний времени"
              />
              <MetricBlock
                title="Score (AI-оценка)"
                description="Общая оценка продуктивности от AI-модели (0–100). Рассчитывается на основе всех метрик с учётом контекста."
                formula="LLM-оценка (0–100)"
                thresholds={{ good: '≥ 70', warning: '50–69', danger: '< 50' }}
                na="если AI-анализ не выполнен или нет данных"
              />
            </div>
          </Card>
        </section>

        {/* 4. Тренды */}
        <section id="trends">
          <Card header={<SectionHeader emoji="📈" title="Тренды метрик" />}>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              Рядом с каждой метрикой отображается индикатор тренда — стрелка и числовая дельта.
              Тренд показывает, как изменилась метрика по сравнению с предыдущей неделей.
            </p>
            <div className="mb-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <span className="font-medium text-emerald-400">↑ +5.2%</span>
                <span>— значение выросло (выше порога чувствительности)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-red-400">↓ -3.1%</span>
                <span>— значение снизилось (ниже порога)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-400">→ 0.8%</span>
                <span>— значение стабильно (изменение в пределах порога)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">—</span>
                <span>— нет данных за предыдущий период для сравнения</span>
              </div>
            </div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Пороги чувствительности</p>
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
              Чтобы стрелка не реагировала на незначительные колебания, для каждого типа метрики задан свой порог:
            </p>
            <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Score, Загрузка, Точность, Фокус, Закрытие</strong> — ±5 пунктов</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Cycle Time</strong> — ±2 часа</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Списано часов</strong> — ±10 часов</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Числовая дельта показывается всегда (включая стабильный тренд), чтобы видеть точное изменение.
            </p>
          </Card>
        </section>

        {/* 5. AI-анализ */}
        <section id="ai-analysis">
          <Card header={<SectionHeader emoji="🤖" title="AI-анализ" />}>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              После сбора метрик AI-модель получает агрегированные показатели и формирует:
            </p>
            <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Score (0–100)</strong> — общая оценка продуктивности</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Сводка</strong> — краткое описание результатов за период</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Достижения</strong> — что сделано хорошо</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Внимание</strong> — проблемы и риски</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Рекомендации</strong> — что можно улучшить</span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              AI анализирует названия задач и определяет их бизнес-значимость.
              Оценка учитывает не только цифры, но и характер работы.
            </p>
          </Card>
        </section>

        {/* 6. Система достижений */}
        <section id="achievements">
          <Card header={<SectionHeader emoji="🏆" title="Система достижений" />}>
            <p className="mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Достижения — это автоматические награды, которые сотрудники получают
              за результаты работы. Система анализирует еженедельные метрики из YouTrack
              и присваивает награды тем, кто достиг определённых показателей.
            </p>

            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Как это работает</p>
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300 marker:text-gray-500">
              <li>Каждую неделю система собирает метрики по задачам и списаниям времени</li>
              <li>По результатам автоматически проверяются условия каждого достижения</li>
              <li>Если сотрудник выполнил условие — он получает награду соответствующего уровня</li>
              <li>Лучшие результаты фиксируются как рекорды</li>
            </ol>

            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Уровни наград</p>
            <div className="mb-1 space-y-1 font-mono text-xs">
              <div className="flex items-center gap-3">
                <span className="w-20 text-gray-500 dark:text-slate-400">Common</span>
                <span className="text-gray-500 dark:text-slate-400">★☆☆☆</span>
                <span className="text-gray-400">— базовый результат</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-20 text-blue-400">Rare</span>
                <span className="text-blue-400">★★☆☆</span>
                <span className="text-gray-400">— хороший результат</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-20 text-purple-400">Epic</span>
                <span className="text-purple-400">★★★☆</span>
                <span className="text-gray-400">— отличный результат</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-20 text-amber-600 dark:text-amber-400">Legendary</span>
                <span className="text-amber-600 dark:text-amber-400">★★★★</span>
                <span className="text-gray-400">— выдающийся результат</span>
              </div>
            </div>
            <p className="mb-4 text-xs text-gray-400">
              Чем выше показатель — тем выше уровень награды. Пороги индивидуальны для каждого типа достижения.
            </p>

            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Серии (стрики)</p>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
              Если сотрудник получает одно и то же достижение несколько недель подряд —
              формируется серия. Длинные серии показывают стабильность результатов.
            </p>

            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Категории</p>
            <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex gap-2">
                <span>⚡</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Продуктивность</strong> — объём и скорость выполнения задач</span>
              </li>
              <li className="flex gap-2">
                <span>🎯</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Качество</strong> — точность оценок, отсутствие багов, скорость закрытия</span>
              </li>
              <li className="flex gap-2">
                <span>⚖️</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Баланс</strong> — оптимальная загрузка, фокус на продуктовых задачах</span>
              </li>
              <li className="flex gap-2">
                <span>📈</span>
                <span><strong className="text-gray-700 dark:text-gray-200">Рост</strong> — положительная динамика показателей</span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-gray-400">
              Все достижения — на странице{' '}
              <Link to="/achievements" className="text-brand-400 hover:text-brand-300 transition-colors">
                Достижений
              </Link>.
            </p>
          </Card>
        </section>

        {/* 7. Что означает "Нет данных" */}
        <section id="no-data">
          <Card header={<SectionHeader emoji="❓" title='Что означает "Нет данных"' />}>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              Метрика показывает «Н/Д» если:
            </p>
            <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span>За период нет задач в YouTrack → все метрики = Н/Д</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span>Нет списаний времени → загрузка = 0% (это валидно, не Н/Д)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span>Нет задач с оценкой → точность = Н/Д</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-500">&bull;</span>
                <span>AI-анализ не выполнен → score = Н/Д</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              Если все метрики = Н/Д, проверьте настройки маппинга полей проекта.
            </p>
          </Card>
        </section>
      </div>
    </>
  );
}

function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
      <span>{emoji}</span>
      {title}
    </h2>
  );
}

interface MetricBlockProps {
  title: string;
  description: string;
  formula: string;
  thresholds: { good: string; warning: string; danger: string };
  na: string;
}

function MetricBlock({ title, description, formula, thresholds, na }: MetricBlockProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-lighter/50 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mb-2 text-sm text-gray-400">{description}</p>
      <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="text-gray-500">Формула:</span> {formula}
      </p>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-emerald-600 dark:text-emerald-400">🟢 {thresholds.good}</span>
        <span className="text-amber-600 dark:text-amber-400">🟡 {thresholds.warning}</span>
        <span className="text-red-600 dark:text-red-400">🔴 {thresholds.danger}</span>
      </div>
      <p className="text-xs text-gray-500">Н/Д: {na}</p>
    </div>
  );
}
