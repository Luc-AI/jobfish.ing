import { describe, it, expect } from 'vitest'
import { ROLE_TAXONOMY } from '@/lib/roles'

describe('ROLE_TAXONOMY', () => {
  it('has 9 top-level categories', () => {
    expect(ROLE_TAXONOMY).toHaveLength(9)
  })

  it('Engineering category has 4 sub-groups', () => {
    const eng = ROLE_TAXONOMY.find(c => c.id === 'engineering')
    expect(eng?.groups).toHaveLength(4)
  })

  it('Product category has a single group with no label', () => {
    const product = ROLE_TAXONOMY.find(c => c.id === 'product')
    expect(product?.groups).toHaveLength(1)
    expect(product?.groups[0].label).toBeNull()
  })

  it('every role is a non-empty string', () => {
    for (const category of ROLE_TAXONOMY) {
      for (const group of category.groups) {
        for (const role of group.roles) {
          expect(typeof role).toBe('string')
          expect(role.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('More category contains Quant Developer', () => {
    const more = ROLE_TAXONOMY.find(c => c.id === 'more')
    const allRoles = more?.groups.flatMap(g => g.roles) ?? []
    expect(allRoles).toContain('Quant Developer')
  })
})
