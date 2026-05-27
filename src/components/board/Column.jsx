import { useDroppable } from '@dnd-kit/core';
import ChoreCard from './ChoreCard';

export default function Column({ title, chores, status, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className={`rt-column ${className}`} style={isOver ? { outline: '3px dashed var(--rt-accent)' } : undefined}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <span className="rt-column__title">
          {title}
          <span className="rt-column__count">{chores.length}</span>
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 200 }}
      >
        {chores.length === 0 && (
          <div className="rt-column__empty">~ no quests ~</div>
        )}
        {chores.map((chore) => (
          <ChoreCard key={chore.id} chore={chore} />
        ))}
      </div>
    </div>
  );
}
