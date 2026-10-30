/** Prepare uses its own detector series, never the unrelated Scan mock. */
import { selectForView } from '@/desk/layers/projection';
import type { Complexity } from '@/desk/types/schemas';
import { toAnnotations } from '@/desk/layers/adapter';
import type { LayerSettingsMap } from '@/desk/layers/layerStore';
import type { InboxItem } from '@/desk/prepare/walk';
import type { Timeframe } from '@/types/market';

export function prepareAnnotations(items: readonly InboxItem[], tf: Timeframe, asOf: number,
  selectedId: string | undefined, settings: LayerSettingsMap, showRejected: boolean, complexity: Complexity = "advanced", price: number | null = null) {
  const selection = selectForView({ objects: items.map(i => i.object), viewTf: tf, asOf, settings, complexity, price, atrView: null });
  const ids = new Set(selection.objects.map(o => o.id));
  const visible = items.filter(({ object: o, triage }) => o.known_at <= asOf &&
    (o.id === selectedId || (ids.has(o.id) && (showRejected || triage !== 'reject'))));
  const states = new Map(visible.map(i => [i.object.id, i]));
  return toAnnotations(visible.map(i => i.object), { viewTf: tf, until: asOf, projected: new Set() }).map(a => {
    const item = states.get(a.id)!;
    const status = item.triage === 'accept' ? '✓ Accepted' : item.triage === 'reject' ? '✗ Rejected'
      : item.triage === 'revisit' ? '? Revisit' : item.custom ? '＋ Custom' : '○ Candidate';
    return { ...a, label: `${a.id === selectedId ? '◎ ' : ''}${status} · ${a.label ?? 'Level'}`,
      emphasis: a.id === selectedId ? 'strong' as const : item.triage === 'reject' ? 'faint' as const : 'normal' as const };
  });
}