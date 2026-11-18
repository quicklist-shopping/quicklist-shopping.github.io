import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { MemoryRouter } from 'react-router-dom';
import { ListPage } from './ListPage';
import { useList } from './useList';

vi.mock('./useList', () => ({ useList: vi.fn() }));

const user = { uid: 'test-user' } as User;

type ListActions = ReturnType<typeof useList>;

function renderEmptyList(addItem: ListActions['addItem'] = vi.fn(async () => undefined)) {
  vi.mocked(useList).mockReturnValue({
    list: { id: 'list-id', items: [] },
    status: 'ready',
    error: '',
    addItem,
    removeItem: vi.fn(async () => undefined),
    cycleItem: vi.fn(async () => undefined),
  });

  return render(
    <MemoryRouter>
      <ListPage listId="list-id" user={user} online />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ListPage add-item input', () => {
  it('does not show redundant guidance when the list is empty', () => {
    renderEmptyList();

    expect(screen.getByRole('textbox', { name: 'Add item' })).toBeInTheDocument();
    expect(screen.queryByText('Add an item to get started.')).not.toBeInTheDocument();
  });

  it('keeps the focused input enabled and focused while saving and after success', async () => {
    const request = deferred<void>();
    const addItem = vi.fn(() => request.promise);
    renderEmptyList(addItem);

    const input = screen.getByRole('textbox', { name: 'Add item' });
    fireEvent.change(input, { target: { value: 'Tea' } });
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(addItem).toHaveBeenCalledWith('Tea');
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();

    await act(async () => request.resolve());
    await waitFor(() => expect(input).toHaveValue(''));
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
  });

  it('ignores duplicate submits and preserves text typed while a write is pending', async () => {
    const request = deferred<void>();
    const addItem = vi.fn(() => request.promise);
    renderEmptyList(addItem);

    const input = screen.getByRole('textbox', { name: 'Add item' });
    fireEvent.change(input, { target: { value: 'Tea' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(addItem).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: 'Bread' } });
    await act(async () => request.resolve());
    expect(input).toHaveValue('Bread');

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(addItem).toHaveBeenCalledTimes(2);
    expect(addItem).toHaveBeenLastCalledWith('Bread');
  });

  it('keeps the submitted text available to retry after a failed write', async () => {
    const addItem = vi.fn(async () => {
      throw new Error('offline write failed');
    });
    renderEmptyList(addItem);

    const input = screen.getByRole('textbox', { name: 'Add item' });
    fireEvent.change(input, { target: { value: 'Soup' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByText('Unable to add this item. Check your connection and try again.')).toBeInTheDocument();
    expect(input).toHaveValue('Soup');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(input).toHaveValue('Soup');
  });
});
