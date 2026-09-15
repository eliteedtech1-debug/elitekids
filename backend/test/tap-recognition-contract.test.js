'use strict';

const { toRuntimeGameConfig } = require('../src/controllers/kids');

describe('Crèche tap-recognition contract', () => {
  test('preserves object ids and correctId when adapting assets format', () => {
    const result = toRuntimeGameConfig({
      template: 'tap-recognition',
      assets: {
        background: 'data:image/svg+xml,background',
        objects: [
          { id: 'tobi', image: 'data:image/svg+xml,tobi', label: 'Tobi' },
          { id: 'ada', image: 'data:image/svg+xml,ada', label: 'Ada' },
          { id: 'kofi', image: 'data:image/svg+xml,kofi', label: 'Kofi' },
        ],
        correctId: 'tobi',
      },
    });

    expect(result.items.map((item) => item.id)).toEqual(['tobi', 'ada', 'kofi']);
    expect(result.correctId).toBe('tobi');
  });

  test('does not replace an explicit answer key with array position', () => {
    const result = toRuntimeGameConfig({
      template: 'tap-recognition',
      correctId: 'kofi',
      items: [
        { id: 'tobi', label: 'Tobi' },
        { id: 'ada', label: 'Ada' },
        { id: 'kofi', label: 'Kofi' },
      ],
    });

    expect(result.correctId).toBe('kofi');
  });
});
