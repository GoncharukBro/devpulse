import { HelpCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface AchievementsHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AchievementsHelpModal({ open, onClose }: AchievementsHelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="🏆 Система достижений">
      <div className="space-y-5 text-sm leading-relaxed text-gray-300">
        <p>
          Достижения — это автоматические награды, которые сотрудники получают
          за результаты работы. Система анализирует еженедельные метрики из YouTrack
          и присваивает награды тем, кто достиг определённых показателей.
        </p>

        <Divider />

        <section>
          <SectionTitle>📊 Как это работает</SectionTitle>
          <ol className="list-decimal space-y-1 pl-5 marker:text-gray-500">
            <li>Каждую неделю система собирает метрики по задачам и списаниям времени</li>
            <li>По результатам автоматически проверяются условия каждого достижения</li>
            <li>Если сотрудник выполнил условие — он получает награду соответствующего уровня</li>
            <li>Лучшие результаты фиксируются как рекорды</li>
          </ol>
        </section>

        <Divider />

        <section>
          <SectionTitle>⭐ Уровни наград</SectionTitle>
          <div className="space-y-1.5 font-mono text-xs">
            <LevelRow label="Common" stars="★☆☆☆" desc="базовый результат" color="text-slate-400" />
            <LevelRow label="Rare" stars="★★☆☆" desc="хороший результат" color="text-blue-400" />
            <LevelRow label="Epic" stars="★★★☆" desc="отличный результат" color="text-purple-400" />
            <LevelRow label="Legendary" stars="★★★★" desc="выдающийся результат" color="text-amber-400" />
          </div>
          <p className="mt-2">
            Чем выше показатель — тем выше уровень награды.
            Пороги индивидуальны для каждого типа достижения.
          </p>
        </section>

        <Divider />

        <section>
          <SectionTitle>🔥 Серии (стрики)</SectionTitle>
          <p>
            Если сотрудник получает одно и то же достижение несколько недель подряд —
            формируется серия. Длинные серии показывают стабильность результатов.
          </p>
        </section>

        <Divider />

        <section>
          <SectionTitle>📁 Категории</SectionTitle>
          <ul className="space-y-1">
            <li><span className="mr-1.5">⚡</span><strong className="text-gray-200">Продуктивность</strong> — объём и скорость выполнения задач</li>
            <li><span className="mr-1.5">🎯</span><strong className="text-gray-200">Качество</strong> — точность оценок, отсутствие багов, скорость закрытия</li>
            <li><span className="mr-1.5">⚖️</span><strong className="text-gray-200">Баланс</strong> — оптимальная загрузка, фокус на продуктовых задачах</li>
            <li><span className="mr-1.5">📈</span><strong className="text-gray-200">Рост</strong> — положительная динамика показателей</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-gray-100">{children}</h3>;
}

function Divider() {
  return <hr className="border-surface-border" />;
}

function LevelRow({ label, stars, desc, color }: { label: string; stars: string; desc: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-20 ${color}`}>{label}</span>
      <span className={color}>{stars}</span>
      <span className="text-gray-400">— {desc}</span>
    </div>
  );
}

export function AchievementsHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
    >
      <HelpCircle className="h-4 w-4" />
      Как это работает?
    </button>
  );
}
