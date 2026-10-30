import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Annotation } from '@/types/annotations';
import type { Candle } from '@/types/market';
import { CanvasRoot } from '@/desk/canvas/CanvasRoot';
import { useCanvasStore } from '@/desk/canvas/canvasStore';
import { useTimelineStore } from '@/desk/canvas/timeline/timelineStore';
import { usePrepareStore } from '@/desk/canvas/prepare/prepareStore';
import { useExploreStore } from '@/desk/canvas/explore/exploreStore';
import { SAMPLE_NOW } from '@/intel/fixtures';

vi.mock('./flag', () => ({ isDemo: () => true }));
vi.mock('./AnnotatedChart', () => ({ AnnotatedChart: ({ annotations, candles }: { annotations: Annotation[]; candles: Candle[] }) =>
  <output data-testid="rendered-chart" data-last-close={(candles.at(-1)?.time ?? 0) + 3600}>
    {JSON.stringify(annotations)}
  </output> }));

beforeEach(() => {
  window.history.replaceState(null, '', '/?window=canvas');
  useCanvasStore.setState({ mode: 'prepare', selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
  useExploreStore.setState({ hiddenEngines: [] });
  useTimelineStore.setState({ asOf: null, playing: false });
});
const annotations = (): Annotation[] => JSON.parse(screen.getByTestId('rendered-chart').textContent ?? '[]');

describe('demo controls drive the actual chart payload', () => {
  it('scenario visibility removes paths, while Simplify retains invalidation and macro risk', async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    expect(annotations().some(a => a.id === 'scn:1:branch:0')).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Scenarios' }));
    expect(annotations().some(a => a.id === 'scn:1:branch:0')).toBe(false);
    expect(annotations().some(a => a.id === 'scn:1:branch:0:stop')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Simplify · P0 stays' }));
    expect(annotations().some(a => a.kind === 'band')).toBe(false);
    expect(annotations().some(a => a.id === 'ins:macro:1')).toBe(true);
    expect(annotations().some(a => a.id === 'scn:1:branch:0:stop')).toBe(true);
  });
  it('replay filters both candles and intelligence and keeps a chart in Monitor and Review', async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    await user.click(screen.getByRole('button', { name: 'Step timeline back' }));
    const asOf = useTimelineStore.getState().asOf!;
    expect(asOf).toBeLessThan(SAMPLE_NOW);
    expect(Number(screen.getByTestId('rendered-chart').dataset.lastClose)).toBeLessThanOrEqual(asOf);
    expect(annotations().every(a => a.known_at <= asOf)).toBe(true);
    expect(annotations().some(a => a.kind === 'band')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Monitor' }));
    expect(screen.getByTestId('rendered-chart')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByTestId('rendered-chart')).toBeTruthy();
  });
  it('query and layer controls reach chart geometry rather than only panel text', async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    await user.click(screen.getByRole('button', { name: 'Show all intelligence' }));
    await user.type(screen.getByRole('textbox', { name: 'Visual query' }), 'show support{Enter}');
    expect(annotations().find(a => a.id === 'sr_level:EUR_USD:H1:1746810000')?.label).toContain('◎');
    await user.click(screen.getByRole('checkbox', { name: 'Objects' }));
    expect(annotations().some(a => a.id === 'sr_level:EUR_USD:H1:1746810000')).toBe(false);
    expect(annotations().some(a => a.id.includes(':stop'))).toBe(true);
  });
});