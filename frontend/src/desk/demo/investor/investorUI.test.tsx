import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Candle } from '@/types/market';
import type { Annotation } from '@/types/annotations';
import { InvestorDemo } from './InvestorDemo';
vi.mock('../AnnotatedChart', () => ({ AnnotatedChart: ({ candles, annotations }: { candles: Candle[]; annotations: Annotation[] }) =>
  <output data-testid="investor-chart" data-last={candles.at(-1)?.close}>{JSON.stringify(annotations)}</output> }));
const chart = (): Annotation[] => JSON.parse(screen.getByTestId('investor-chart').textContent ?? '[]');
const chapter = async (name: string) => userEvent.click(within(screen.getByRole('navigation', { name: 'Demo chapters' })).getByRole('button', { name: new RegExp(name) }));

describe('investor walkthrough interactions', () => {
  it('moves from shared evidence to plan to outcome, and rewinds without leaking results', async () => {
    const user = userEvent.setup(); render(<InvestorDemo onGallery={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Advance to +30m' }));
    await chapter('Prepare');
    await user.click(screen.getByRole('button', { name: /Observed · support zone/ }));
    expect(chart().find(a => a.id === 'support')?.label).toContain('◎');
    await user.click(screen.getByRole('button', { name: 'Advance to +120m' }));
    await chapter('Review');
    expect(screen.getByText(/Outcome: Target/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Inspect frozen decision' }));
    expect(screen.queryByText(/Outcome: Target/)).not.toBeInTheDocument();
    expect(chart().some(a => a.id.endsWith(':exit'))).toBe(false);
    await chapter('Plan');
    expect(screen.getByRole('spinbutton', { name: 'entry' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reset story' }));
    expect(screen.queryByText(/Plan frozen with evidence/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Advance to +30m' })).toBeEnabled();
  });
  it('edits actual chart geometry and keeps P0 when simplified', async () => {
    const user = userEvent.setup(); render(<InvestorDemo onGallery={() => {}} />);
    await user.click(screen.getByRole('checkbox', { name: 'Guided sample decisions' }));
    await chapter('Plan');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'target' }), { target: { value: '1.104' } });
    const target = chart().find(a => a.id === 'target');
    expect(target?.kind === 'level' && target.price).toBe(1.104);
    await user.click(screen.getByRole('checkbox', { name: 'Simplify · P0 stays' }));
    expect(chart().some(a => a.id === 'target')).toBe(false);
    expect(chart().some(a => a.id === 'invalidation')).toBe(true);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'stop' }), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Freeze plan' })).toBeDisabled();
  });
  it('shows the blocked story, stale feed, and causal research milestones', async () => {
    const user = userEvent.setup(); render(<InvestorDemo onGallery={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Story' }), 'protect');
    await user.click(screen.getByRole('button', { name: 'Advance to +70m' }));
    await chapter('Intelligence');
    expect(screen.getByText(/WITHHELD: stale feed/)).toBeInTheDocument();
    await chapter('Research');
    expect(screen.queryByText(/Judge: FAIL/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Advance to +120m' }));
    expect(screen.getByText(/Judge: FAIL/)).toBeInTheDocument();
    await chapter('Review');
    expect(screen.getByText(/Outcome: No executed trade/)).toBeInTheDocument();
  });
});
