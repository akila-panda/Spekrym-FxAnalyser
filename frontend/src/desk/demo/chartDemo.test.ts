import { describe, expect, it } from 'vitest';
import { toSpecs } from '@/annotations/toPrimitives';
import { SAMPLE_NOW } from '@/intel/fixtures';
import { useLayerStore } from '@/desk/layers/layerStore';
import { intelligenceFixtures } from './intelligenceFixtures';
import { intelligenceFeatures } from './intelligenceChartModel';
import { prepareAnnotations } from './prepareChartModel';

describe('demo chart contracts and causality', () => {
  it('renders valid annotations for every intelligence family and keeps the uncalibrated forecast withheld', () => {
    const scene = intelligenceFixtures('EUR_USD');
    const features = intelligenceFeatures(scene, 'EUR_USD', SAMPLE_NOW);
    expect(new Set(features.map(f => f.group))).toEqual(new Set(['objects', 'scenarios', 'forecast', 'regime', 'session', 'risk', 'trades']));
    const specs = toSpecs(features.flatMap(f => f.annotations), { resolve: () => '#aaa', pair: 'EUR_USD', text: '#fff', bg: '#000', font: 'monospace' });
    expect(specs.shapes.some(s => s.type === 'bandfill')).toBe(true);
    expect(specs.shapes.some(s => s.type === 'trade')).toBe(true);
    expect(specs.shapes.some(s => s.type === 'line')).toBe(true);
    expect(specs.indicators).toHaveLength(3);
    expect(features.find(f => f.id === 'scn:2')?.annotations).toHaveLength(0);
    expect(features.find(f => f.id === 'scn:demo-envelope')?.annotations.some(a => a.kind === 'band')).toBe(true);
    expect(features.filter(f => f.p0).length).toBeGreaterThan(1);
  });
  it('replay hides forecasts, future exits, scenario revisions and unavailable interpretations', () => {
    const scene = intelligenceFixtures('EUR_USD');
    const asOf = SAMPLE_NOW - 5400;
    const features = intelligenceFeatures(scene, 'EUR_USD', asOf);
    const annotations = features.flatMap(f => f.annotations);
    expect(annotations.every(a => a.known_at <= asOf)).toBe(true);
    expect(features.some(f => f.id === 'scn:demo-envelope')).toBe(false);
    expect(features.some(f => f.id === 'scn:1:branch:1')).toBe(false);
    expect(annotations.some(a => a.id === 't:4:exit')).toBe(false);
    expect(features.some(f => f.id === 'scn:1:branch:0')).toBe(true);
  });
  it('maps prices and identities consistently for JPY and does not render another instrument', () => {
    const scene = intelligenceFixtures('USD_JPY');
    expect(scene.objects.every(o => o.pair === 'USD_JPY')).toBe(true);
    expect(scene.scenarios.every(s => s.instrument === 'USD_JPY')).toBe(true);
    expect(scene.objects[0]!.geometry.bands[0]!.pLow).toBeGreaterThan(100);
    expect(scene.candles.every(c => c.low > 100 && c.low <= c.open && c.high >= c.close)).toBe(true);
    expect(intelligenceFeatures(scene, 'EUR_USD', SAMPLE_NOW).filter(f => f.group === 'objects' || f.group === 'trades')).toHaveLength(0);
  });
  it('Prepare respects layers and triage while pinning the selected candidate and excluding future objects', () => {
    const scene = intelligenceFixtures('EUR_USD');
    const first = scene.objects[0]!;
    const second = scene.objects.find(o => o.type === 'sd_zone')!;
    const settings = structuredClone(useLayerStore.getState().settings);
    settings[first.layer].visible = false;
    const items = [{ object: first, custom: false, triage: 'reject' as const }, { object: second, custom: false, triage: 'accept' as const }];
    const annotations = prepareAnnotations(items, 'H1', SAMPLE_NOW, first.id, settings, false);
    expect(annotations.find(a => a.id === first.id)?.label).toContain('◎ ✗ Rejected');
    expect(annotations.find(a => a.id === second.id)?.label).toContain('✓ Accepted');
    expect(prepareAnnotations(items, 'H1', SAMPLE_NOW, undefined, settings, false).some(a => a.id === first.id)).toBe(false);
    expect(prepareAnnotations(items, 'H1', first.known_at - 1, first.id, settings, true).some(a => a.id === first.id)).toBe(false);
  });
});