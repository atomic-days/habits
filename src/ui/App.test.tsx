import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { App } from './App.tsx';

test('renders the app title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
});
