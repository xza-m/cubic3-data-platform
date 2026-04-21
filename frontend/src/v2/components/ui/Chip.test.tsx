// frontend/src/v2/components/ui/Chip.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Chip, type ChipTone } from './Chip'

describe('Chip', () => {
  it('renders default neutral chip', () => {
    render(<Chip>label</Chip>)
    const el = screen.getByText('label')
    expect(el.className).toContain('chip')
    expect(el.className).toContain('chip-neutral')
  })

  it.each<ChipTone>(['accent', 'success', 'warning', 'danger', 'violet', 'neutral'])(
    'applies tone class %s',
    (tone) => {
      render(<Chip tone={tone}>{tone}</Chip>)
      expect(screen.getByText(tone).className).toContain(`chip-${tone}`)
    },
  )

  it('passes through HTML attributes', () => {
    render(<Chip data-testid="c">x</Chip>)
    expect(screen.getByTestId('c')).toBeInTheDocument()
  })
})
