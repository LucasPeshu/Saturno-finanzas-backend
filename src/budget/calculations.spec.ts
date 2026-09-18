import {
  allocation,
  dueDate,
  goalRecommendation,
  splitAmount,
  today,
} from './calculations';

describe('Budget policies', () => {
  it('uses Argentina day boundaries independently of the machine time zone', () => {
    expect(today(new Date('2026-09-02T02:59:59Z'))).toBe('2026-09-01');
    expect(today(new Date('2026-09-02T03:00:00Z'))).toBe('2026-09-02');
  });
  it('clamps recurring due dates for February and leap years', () => {
    expect(dueDate('2026-02', 31)).toBe('2026-02-28');
    expect(dueDate('2028-02', 31)).toBe('2028-02-29');
  });
  it('keeps every cent in equal and weighted distributions', () => {
    expect(splitAmount(100, [3, 1, 2])).toEqual([
      { userId: 1, amount: 33.34 },
      { userId: 2, amount: 33.33 },
      { userId: 3, amount: 33.33 },
    ]);
    expect(
      splitAmount(
        0.03,
        [1, 2],
        [
          { userId: 1, percent: 50 },
          { userId: 2, percent: 50 },
        ],
      ),
    ).toEqual([
      { userId: 1, amount: 0.02 },
      { userId: 2, amount: 0.01 },
    ]);
    expect(() =>
      splitAmount(100, [1, 2], [{ userId: 1, percent: 70 }]),
    ).toThrow();
    expect(() =>
      splitAmount(100, [1, 2], [{ userId: 3, percent: 100 }]),
    ).toThrow();
  });
  it('covers priorities first and divides only the surplus', () => {
    const result = allocation(
      1100000,
      [
        {
          id: 1,
          description: 'Alquiler',
          remaining: 600000,
          priority: 100,
          dueDate: '2026-09-10',
        },
      ],
      60,
      20,
    );
    expect(result).toMatchObject({
      pending: 600000,
      shortfall: 0,
      surplus: 500000,
      suggestedSavings: 300000,
      reserve: 100000,
      discretionary: 100000,
    });
    const insufficient = allocation(
      100,
      [
        {
          id: 1,
          description: 'Juego',
          remaining: 80,
          priority: 10,
          dueDate: '2026-09-01',
        },
        {
          id: 2,
          description: 'Luz',
          remaining: 100,
          priority: 100,
          dueDate: '2026-09-20',
        },
      ],
      60,
      20,
    );
    expect(insufficient.expenses[0]).toMatchObject({ id: 2, allocated: 100 });
    expect(insufficient.shortfall).toBe(80);
    expect(insufficient.suggestedSavings).toBe(0);
  });
  it('subtracts savings already deposited in the period from the recommendation', () => {
    const almostDone = allocation(141000, [], 60, 20, 209000);
    expect(almostDone).toMatchObject({
      surplus: 141000,
      suggestedSavings: 1000,
      reserve: 70000,
      discretionary: 70000,
    });
    const withExtraIncome = allocation(241000, [], 60, 20, 209000);
    expect(withExtraIncome).toMatchObject({
      surplus: 241000,
      suggestedSavings: 61000,
      reserve: 90000,
      discretionary: 90000,
    });
  });
  it('adds a margin per competing goal and never mistakes progress for purchase', () => {
    expect(goalRecommendation(700, 700, 700, 0, 25).recommendedToBuy).toBe(
      true,
    );
    expect(goalRecommendation(700, 700, 700, 1, 25).recommendedToBuy).toBe(
      false,
    );
    expect(goalRecommendation(700, 700, 1300, 1, 25).recommendedToBuy).toBe(
      true,
    );
    expect(goalRecommendation(700, 700, 1000, 2, 25).recommendedToBuy).toBe(
      false,
    );
    expect(goalRecommendation(700, 0, 1300, 1, 25).recommendedToBuy).toBe(
      false,
    );
  });
});
