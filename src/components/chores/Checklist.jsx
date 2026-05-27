import { Form } from 'react-bootstrap';

export default function Checklist({ items = [], choreId, onToggle, readOnly = false }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-muted small mb-0">No checklist items</p>
    );
  }

  return (
    <div className="d-flex flex-column gap-1">
      {items.map((item) => (
        <Form.Check
          key={item.id}
          type="checkbox"
          id={`checklist-${choreId}-${item.id}`}
          label={
            <span
              style={{
                textDecoration: item.completed ? 'line-through' : 'none',
                color: item.completed ? '#6c757d' : 'inherit',
              }}
            >
              {item.text}
            </span>
          }
          checked={!!item.completed}
          disabled={readOnly}
          onChange={() => {
            if (!readOnly && onToggle) {
              onToggle(item.id);
            }
          }}
        />
      ))}
    </div>
  );
}
