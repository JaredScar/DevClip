import { randomUUID } from 'crypto';
import { getDb } from './db';

export interface AutomationRuleRow {
  id: number;
  name: string;
  enabled: number;
  trigger: string;
  conditions: string;
  actions: string;
  sync_uid?: string | null;
  updated_at?: number;
  created_at: string;
}

export function listAutomationRules(): AutomationRuleRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM automation_rules ORDER BY id`)
    .all() as AutomationRuleRow[];
}

export function listAutomationRulesForSync(): AutomationRuleRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM automation_rules ORDER BY id`).all() as AutomationRuleRow[];
  for (const r of rows) {
    if (!r.sync_uid?.trim()) {
      const u = randomUUID();
      db.prepare('UPDATE automation_rules SET sync_uid = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = ?').run(
        u,
        r.id
      );
      r.sync_uid = u;
    }
  }
  return rows;
}

export function upsertAutomationFromSync(entry: {
  sync_uid: string;
  name: string;
  enabled: number;
  trigger: string;
  conditions: string;
  actions: string;
  updated_at: number;
}): void {
  const db = getDb();
  const existing = db.prepare('SELECT id, updated_at FROM automation_rules WHERE sync_uid = ?').get(entry.sync_uid) as
    | { id: number; updated_at: number }
    | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO automation_rules (name, enabled, trigger, conditions, actions, sync_uid, updated_at)
       VALUES (@name, @enabled, @trigger, @conditions, @actions, @sync_uid, @updated_at)`
    ).run(entry);
    return;
  }
  if (entry.updated_at <= existing.updated_at) return;
  db.prepare(
    `UPDATE automation_rules SET name=@name, enabled=@enabled, trigger=@trigger,
     conditions=@conditions, actions=@actions, updated_at=@updated_at WHERE id=@id`
  ).run({ ...entry, id: existing.id });
}

export function listEnabledAutomationRules(): AutomationRuleRow[] {
  return listAutomationRules().filter((r) => r.enabled === 1);
}

export function insertAutomationRule(input: {
  name: string;
  trigger: string;
  conditions: string;
  actions: string;
  enabled?: number;
}): number {
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO automation_rules (name, enabled, trigger, conditions, actions, sync_uid, updated_at)
       VALUES (@name, @enabled, @trigger, @conditions, @actions, @sync_uid, strftime('%s','now'))`
    )
    .run({
      name: input.name.trim(),
      enabled: input.enabled ?? 1,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      sync_uid: randomUUID(),
    });
  return Number(r.lastInsertRowid);
}

export function updateAutomationRule(input: {
  id: number;
  name: string;
  enabled: number;
  trigger: string;
  conditions: string;
  actions: string;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE automation_rules SET name=@name, enabled=@enabled, trigger=@trigger,
     conditions=@conditions, actions=@actions, updated_at=strftime('%s','now') WHERE id=@id`
  ).run(input);
}

export function deleteAutomationRule(id: number): void {
  getDb().prepare('DELETE FROM automation_rules WHERE id = ?').run(id);
}
