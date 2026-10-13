import { buildCategoryTree } from '../../src/modules/categories/category.service.js';
import { canTransitionOrderStatus } from '../../src/common/constants/order-statuses.js';
import { effectivePriceOf } from '../../src/modules/products/product.model.js';

const doc = (overrides) => ({
  _id: overrides._id,
  name: overrides.name,
  slug: overrides.slug ?? overrides.name.toLowerCase(),
  parent: overrides.parent ?? null,
  isActive: overrides.isActive ?? true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

describe('buildCategoryTree', () => {
  it('nests unlimited levels in O(n) assembly', () => {
    const tree = buildCategoryTree([
      doc({ _id: 's', name: 'Smartphones', parent: 'm' }),
      doc({ _id: 'e', name: 'Electronics' }),
      doc({ _id: 'm', name: 'Mobiles', parent: 'e' }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Electronics');
    expect(tree[0].children[0].name).toBe('Mobiles');
    expect(tree[0].children[0].children[0].name).toBe('Smartphones');
    expect(tree[0].children[0].children[0].children).toEqual([]);
  });

  it('sorts siblings by name and surfaces orphans as roots', () => {
    const tree = buildCategoryTree([
      doc({ _id: 'b', name: 'Beta' }),
      doc({ _id: 'a', name: 'Alpha' }),
      doc({ _id: 'o', name: 'Orphan', parent: 'missing' }),
    ]);
    expect(tree.map((n) => n.name)).toEqual(['Alpha', 'Beta', 'Orphan']);
  });

  it('keeps inactive categories flagged instead of pruning them', () => {
    const tree = buildCategoryTree([doc({ _id: 'e', name: 'Electronics' }), doc({ _id: 'l', name: 'Legacy', parent: 'e', isActive: false })]);
    expect(tree[0].children[0]).toMatchObject({ name: 'Legacy', isActive: false });
  });

  it('returns an empty array for empty input', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});

describe('canTransitionOrderStatus', () => {
  it.each([
    ['pending', 'confirmed', true],
    ['pending', 'cancelled', true],
    ['pending', 'shipped', false],
    ['confirmed', 'processing', true],
    ['processing', 'shipped', true],
    ['shipped', 'delivered', true],
    ['shipped', 'cancelled', false],
    ['delivered', 'cancelled', false],
    ['cancelled', 'pending', false],
  ])('%s -> %s is %s', (from, to, expected) => {
    expect(canTransitionOrderStatus(from, to)).toBe(expected);
  });
});

describe('effectivePriceOf', () => {
  it('prefers a valid sale price', () => {
    expect(effectivePriceOf({ price: 120, salePrice: 70 })).toBe(70);
  });

  it('falls back to base price when sale is absent or invalid', () => {
    expect(effectivePriceOf({ price: 100, salePrice: null })).toBe(100);
    expect(effectivePriceOf({ price: 100, salePrice: 200 })).toBe(100);
  });
});
