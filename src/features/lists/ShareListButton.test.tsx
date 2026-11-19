import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareListButton } from './ShareListButton';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  window.location.hash = '';
});

describe('ShareListButton', () => {
  it('is not offered when the native share sheet is unavailable', () => {
    render(<ShareListButton />);
    expect(screen.queryByRole('button', { name: 'Share this list' })).not.toBeInTheDocument();
  });

  it('shares the current list URL, including its hash route', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    window.location.hash = '#/my-list';
    render(<ShareListButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Share this list' }));
    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: 'Quicklist',
      url: window.location.href,
    });
    expect(share.mock.calls[0][0].url).toContain('#/my-list');
  });

  it('does not show an error when the user cancels sharing', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareListButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share this list' }));
    });
    expect(screen.queryByText(/Could not open the share menu/)).not.toBeInTheDocument();
  });

  it('explains a sharing failure without hiding the list', async () => {
    const share = vi.fn().mockRejectedValue(new Error('Share unavailable'));
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareListButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share this list' }));
    });
    expect(screen.getByText(/Could not open the share menu/)).toBeInTheDocument();
  });
});
