import { useState } from 'preact/hooks';
import { useApp } from './AppContext.tsx';

export function Archived() {
  const { data, openForm } = useApp();
  const [open, setOpen] = useState(false);
  const archived = data.habits.filter((h) => h.archived);
  if (archived.length === 0) return null;
  return (
    <section class="archived">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Archived ({archived.length})</button>
      {open && (
        <ul class="list" aria-label="Archived">
          {archived.map((h) => (
            <li key={h.id}>
              <button type="button" class="archived-item" onClick={() => openForm(h.id)}>{h.name}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
