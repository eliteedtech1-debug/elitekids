'use strict';

const { PLACEMENT_QUESTION_FIXTURE } = require('../src/controllers/kidsPlacement');

describe('early-years placement content contract', () => {
  test('does not ask a visual-only Playgroup round to listen to unavailable audio', () => {
    const playgroup = PLACEMENT_QUESTION_FIXTURE.find((question) => question.nerdc_band === 'Playgroup');
    expect(playgroup.prompt).toBe('Look at the pictures. Which one shows a loud drum?');
    expect(playgroup.options.some((option) => option.id === 'drum')).toBe(true);
  });
});
