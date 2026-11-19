import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { ItemRow } from './ItemRow';
import { StaleItemStateError } from '../../services/firebase/lists';

const item = { id: 'milk-id', name: 'Milk', state: 'UNKNOWN' as const, updatedAt: new Timestamp(1, 0) };

const props = (onCycle = vi.fn().mockResolvedValue(undefined), onRemove = vi.fn().mockResolvedValue(undefined)) => ({
  item, onCycle, onRemove, onError: vi.fn(), onConflict: vi.fn(), disabled: false,
});

describe('ItemRow', () => {
  it('shows item state and requests a transition from the observed revision when clicked', () => {
    const callbacks = props();
    render(<ItemRow {...callbacks} />);

    fireEvent.click(screen.getByRole('button', { name: /Milk, unknown. Tap to change status/ }));
    expect(callbacks.onCycle).toHaveBeenCalledWith(item);
    expect(callbacks.onRemove).not.toHaveBeenCalled();
  });

  it('removes the selected item without cycling its state', () => {
    const callbacks = props();
    render(<ItemRow {...callbacks} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Milk' }));
    expect(callbacks.onRemove).toHaveBeenCalledWith('milk-id');
    expect(callbacks.onCycle).not.toHaveBeenCalled();
  });

  it('reports a stale click without opening the general write-error dialog', async () => {
    const callbacks = props(vi.fn().mockRejectedValue(new StaleItemStateError()));
    render(<ItemRow {...callbacks} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Milk, unknown. Tap to change status/ }));
    });
    expect(callbacks.onConflict).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
