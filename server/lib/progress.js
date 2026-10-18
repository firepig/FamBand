// A quest has "progress" once anyone has acted on it. Such cards are never
// deleted or rewritten behind the family's back when a series changes.
export function choreHasProgress(db, chore) {
  return chore.status !== 'todo'
    || !!chore.photo_proof
    || !!db.prepare('SELECT 1 FROM checklist_items WHERE chore_id = ? AND completed = 1 LIMIT 1').get(chore.id)
    || !!db.prepare('SELECT 1 FROM points_ledger WHERE chore_id = ? LIMIT 1').get(chore.id);
}
