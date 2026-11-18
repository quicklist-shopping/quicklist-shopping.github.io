import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemRow } from './ItemRow';

const item = { id: 'milk-id', name: 'Milk', state: 'UNKNOWN' as const };

describe('ItemRow', () => {
  it('shows item state and requests the next state when clicked', () => {
    const onCycle = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<ItemRow item={item} onCycle={onCycle} onRemove={onRemove} onError={vi.fn()} disabled={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Milk, unknown' }));
    expect(onCycle).toHaveBeenCalledWith('milk-id');
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('removes the selected item without cycling its state', () => {
    const onCycle = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<ItemRow item={item} onCycle={onCycle} onRemove={onRemove} onError={vi.fn()} disabled={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Milk' }));
    expect(onRemove).toHaveBeenCalledWith('milk-id');
    expect(onCycle).not.toHaveBeenCalled();
  });
});
