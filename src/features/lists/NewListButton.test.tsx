import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { createList } from '../../services/firebase/lists';
import { NewListButton } from './NewListButton';

vi.mock('../../services/firebase/lists', () => ({ createList: vi.fn() }));

const user = { uid: 'test-user' } as User;

beforeEach(() => vi.clearAllMocks());

describe('NewListButton', () => {
  it('shows a clear label and creates a list before navigating to its URL', async () => {
    vi.mocked(createList).mockResolvedValue('new-id');
    render(
      <MemoryRouter initialEntries={['/']}>
        <NewListButton user={user} online />
        <Routes><Route path="/:id" element={<div>List opened</div>} /></Routes>
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Create a new list' });
    expect(button).toHaveTextContent('New list');
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText('List opened')).toBeInTheDocument());
    expect(createList).toHaveBeenCalledExactlyOnceWith('test-user');
  });

  it('cannot create a list while offline', () => {
    render(<MemoryRouter><NewListButton user={user} online={false} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Create a new list' })).toBeDisabled();
    expect(createList).not.toHaveBeenCalled();
  });
});
