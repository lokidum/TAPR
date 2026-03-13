import { calculateLevel, getLevelTitle } from '../src/jobs/level-up.job';

describe('calculateLevel', () => {
  const base = {
    aqfCertLevel: null as string | null,
    certVerifiedAt: null as Date | null,
    isLevel6Eligible: false,
  };

  describe('Level 1 — default', () => {
    it('returns 1 for 0 cuts', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 0, averageRating: 0 })).toBe(1);
    });

    it('returns 1 for 49 cuts with 4.5 rating (below level 2 cut threshold)', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 49, averageRating: 4.5 })).toBe(1);
    });

    it('returns 1 for 50 cuts with 3.9 rating (below level 2 rating threshold)', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 50, averageRating: 3.9 })).toBe(1);
    });
  });

  describe('Level 2 — 50+ cuts, 4.0+ rating', () => {
    it('returns 2 for 50 cuts and 4.0 rating', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 50, averageRating: 4.0 })).toBe(2);
    });

    it('returns 2 for 100 cuts and 4.2 rating', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 100, averageRating: 4.2 })).toBe(2);
    });

    it('returns 2 for 249 cuts and 4.4 rating (below level 3)', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 249, averageRating: 4.4 })).toBe(2);
    });
  });

  describe('Level 3 — 250+ cuts, 4.5+ rating', () => {
    it('returns 3 for 250 cuts and 4.5 rating', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 250, averageRating: 4.5 })).toBe(3);
    });

    it('returns 3 for 500 cuts and 4.7 rating', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 500, averageRating: 4.7 })).toBe(3);
    });

    it('returns 2 for 250 cuts and 4.4 rating (below level 3 rating)', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 250, averageRating: 4.4 })).toBe(2);
    });
  });

  describe('Level 4 — 1000+ cuts, 4.8+ rating', () => {
    it('returns 4 for 1000 cuts and 4.8 rating', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 1000, averageRating: 4.8 })).toBe(4);
    });

    it('returns 4 for 2000 cuts and 4.9 rating', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 2000, averageRating: 4.9 })).toBe(4);
    });

    it('returns 3 for 1000 cuts and 4.7 rating (below level 4 rating)', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 1000, averageRating: 4.7 })).toBe(3);
    });

    it('returns 3 for 999 cuts and 4.8 rating (below level 4 cut threshold)', () => {
      expect(calculateLevel({ ...base, totalVerifiedCuts: 999, averageRating: 4.8 })).toBe(3);
    });
  });

  describe('Level 5 — any cuts, 4.8+ rating, cert required', () => {
    it('returns 5 for 10 cuts, 4.8 rating, cert verified', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 10,
          averageRating: 4.8,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: new Date(),
        })
      ).toBe(5);
    });

    it('returns 5 for 10 cuts, 4.9 rating, cert verified', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 10,
          averageRating: 4.9,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: new Date(),
        })
      ).toBe(5);
    });

    it('returns 4 for 1000 cuts, 4.8 rating, no cert (level 5 requires cert)', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 1000,
          averageRating: 4.8,
          aqfCertLevel: null,
          certVerifiedAt: null,
        })
      ).toBe(4);
    });

    it('returns 4 for 1000 cuts, 4.8 rating, cert level set but not verified', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 1000,
          averageRating: 4.8,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: null,
        })
      ).toBe(4);
    });

    it('returns 4 for 1000 cuts, 4.8 rating, empty cert level', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 1000,
          averageRating: 4.8,
          aqfCertLevel: '   ',
          certVerifiedAt: new Date(),
        })
      ).toBe(4);
    });

    it('returns 2 for 4.7 rating with cert (below level 5 rating threshold)', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 100,
          averageRating: 4.7,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: new Date(),
        })
      ).toBe(2);
    });
  });

  describe('Level 6 — any cuts, 4.9+ rating, is_level6_eligible', () => {
    it('returns 6 for 1 cut, 4.9 rating, cert verified, is_level6_eligible', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 1,
          averageRating: 4.9,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: new Date(),
          isLevel6Eligible: true,
        })
      ).toBe(6);
    });

    it('returns 6 for 0 cuts, 4.9 rating, is_level6_eligible (admin override)', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 0,
          averageRating: 4.9,
          isLevel6Eligible: true,
        })
      ).toBe(6);
    });

    it('returns 5 for 4.9 rating, cert verified, but NOT is_level6_eligible', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 10,
          averageRating: 4.9,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: new Date(),
          isLevel6Eligible: false,
        })
      ).toBe(5);
    });

    it('returns 5 for 4.8 rating, cert verified, is_level6_eligible (below 4.9)', () => {
      expect(
        calculateLevel({
          ...base,
          totalVerifiedCuts: 10,
          averageRating: 4.8,
          aqfCertLevel: 'cert_iii',
          certVerifiedAt: new Date(),
          isLevel6Eligible: true,
        })
      ).toBe(5);
    });
  });
});

describe('getLevelTitle', () => {
  it('returns correct titles for levels 1–6', () => {
    expect(getLevelTitle(1)).toBe('Novice');
    expect(getLevelTitle(2)).toBe('Rising');
    expect(getLevelTitle(3)).toBe('Senior');
    expect(getLevelTitle(4)).toBe('Expert');
    expect(getLevelTitle(5)).toBe('Certified');
    expect(getLevelTitle(6)).toBe('Master');
  });

  it('returns Novice for unknown level', () => {
    expect(getLevelTitle(0)).toBe('Novice');
    expect(getLevelTitle(99)).toBe('Novice');
  });
});
