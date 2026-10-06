/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// T027a: behaviour of the proposed-identity mock-ups (T027). Tagged @mockup, so the `ci` project runs
// them (it only inverts @local|@visual|@manual) and the `visual` project does not. DOM contract: the
// header comment of visual.spec.ts. Every test is on ?live=off unless it says otherwise and asserts
// that no /api request is made. ASSUMPTIONS the foundation work must meet (not in the contract text):
//   - today: inbox messages have a "mark read" button (accessible name /mark.*read/i); calendar days are
//     role="tab" elements inside [data-mockup-panel="calendar"]
//   - widgets: the add-widget sheet lists the widgets not on the strip as buttons named after the widget;
//     each widget has a [data-widget-body] element (the container-query target, see Fluid below)
//   - mk-display / mk-main are class names on the display figure and the main column

const proposed = ['month-view', 'add-expense', 'settings', 'today', 'widgets'] as const;
const url = (route: string, q = 'live=off') => `/__ui/mockups/${route}${q ? `?${q}` : ''}`;
const NAMES: Record<string, string> = {
  currency: 'Currency',
  weather: 'Weather',
  sunrise: 'Sunrise',
  'spend-pace': 'Spend pace',
  'fixed-costs': 'Fixed costs',
};

function noApi(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api')) calls.push(r.url());
  });
  return calls;
}

// Waits for the lazy route chunk: the strip is empty until the mock-up has rendered.
const order = async (page: Page) => {
  const widgets = page.locator('[data-mockup-panel="strip"] [data-widget]');
  await expect(widgets.first()).toBeVisible();
  return widgets.evaluateAll((els) => els.map((e) => e.getAttribute('data-widget')!));
};

const tileAmount = (page: Page, label: string) =>
  page.locator('[data-tile]', { hasText: label }).locator('[data-testid="tile-amount"]').first();

test.describe('@mockup behaviour', () => {
  test('@mockup month-view: switch month, add and remove an expense', async ({ page }) => {
    const api = noApi(page);
    await page.goto(url('month-view'));
    const label = page.getByTestId('month-label');
    const before = await label.innerText();
    const rowsBefore = await page.getByTestId('entry-row').allInnerTexts();
    await page.getByTestId('month-prev').click();
    await expect(label).not.toHaveText(before);
    await expect.poll(() => page.getByTestId('entry-row').allInnerTexts()).not.toEqual(rowsBefore);
    await page.getByTestId('month-next').click();
    await expect(label).toHaveText(before);

    const rows = page.getByTestId('entry-row');
    const count = await rows.count();
    const spent = await tileAmount(page, 'Spent').innerText();
    const left = await tileAmount(page, 'Left').innerText();
    await page
      .getByRole('button', { name: /add expense/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('add-expense')).toBeFocused();
    await page.getByTestId('add-expense').click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Amount').fill('12.34');
    await dialog.getByLabel('Category').selectOption({ index: 1 });
    await dialog.getByLabel('Note').fill('Mockup test lunch');
    await dialog.getByRole('button', { name: 'Add expense' }).click();
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(count + 1);
    await expect(tileAmount(page, 'Spent')).not.toHaveText(spent);
    await expect(tileAmount(page, 'Left')).not.toHaveText(left);

    await page.getByRole('button', { name: 'Remove Mockup test lunch' }).click();
    await expect(rows).toHaveCount(count);
    expect(api).toEqual([]);
  });

  test('@mockup widgets: keyboard reorder keeps focus on the equivalent button', async ({
    page,
  }) => {
    const api = noApi(page);
    await page.goto(url('widgets'));
    const [first, second] = await order(page);
    const btn = page.getByRole('button', { name: `Move ${NAMES[first!]} later` });
    await btn.focus();
    await page.keyboard.press('Enter');
    expect((await order(page)).slice(0, 2)).toEqual([second, first]);
    await expect(page.getByRole('button', { name: `Move ${NAMES[first!]} later` })).toBeFocused();
    expect(api).toEqual([]);
  });

  test('@mockup widgets: pointer drag reorders', async ({ page }) => {
    await page.goto(url('widgets'));
    const before = await order(page);
    const strip = page.locator('[data-mockup-panel="strip"]');
    await strip
      .locator(`[data-widget="${before[0]}"]`)
      .dragTo(strip.locator(`[data-widget="${before[before.length - 1]}"]`));
    const after = await order(page);
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
  });

  test('@mockup widgets: remove then add a widget', async ({ page }) => {
    await page.goto(url('widgets'));
    const strip = page.locator('[data-mockup-panel="strip"]');
    const before = await order(page);
    const victim = before[before.length - 1]!;
    await strip.locator(`[data-widget="${victim}"]`).getByTestId('widget-remove').click();
    await expect(strip.locator('[data-widget]')).toHaveCount(before.length - 1);
    await strip.getByTestId('add-widget').click();
    await page.getByRole('dialog').getByRole('button', { name: NAMES[victim]! }).click();
    await expect(strip.locator(`[data-widget="${victim}"]`)).toHaveCount(1);
    await expect(strip.locator('[data-widget]')).toHaveCount(before.length);
  });

  test('@mockup widgets: both sheets close on Escape and return focus to the opener', async ({
    page,
  }) => {
    await page.goto(url('widgets'));
    const strip = page.locator('[data-mockup-panel="strip"]');
    for (const opener of [
      strip.getByTestId('add-widget'),
      strip.getByTestId('widget-settings').first(),
    ]) {
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(opener).toBeFocused();
    }
  });

  test('@mockup today: mark a message read, switch the calendar day', async ({ page }) => {
    const api = noApi(page);
    await page.goto(url('today'));
    const inbox = page.locator('[data-mockup-panel="inbox"]');
    const mark = inbox.getByRole('button', { name: /mark.*read/i });
    await expect(mark.first()).toBeVisible(); // the route chunk is lazy; count() does not wait
    const n = await mark.count();
    expect(n).toBeGreaterThan(0);
    await mark.first().click();
    await expect(mark).toHaveCount(n - 1);

    const cal = page.locator('[data-mockup-panel="calendar"]');
    const text = await cal.innerText();
    await cal.getByRole('tab').nth(1).click();
    await expect(cal.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => cal.innerText()).not.toBe(text);
    expect(api).toEqual([]);
  });

  test('@mockup settings: switch month and theme', async ({ page }) => {
    const api = noApi(page);
    await page.goto(url('settings'));
    const label = page.getByTestId('month-label');
    const before = await label.innerText();
    await page.getByTestId('month-next').click();
    await expect(label).not.toHaveText(before);
    await page.getByTestId('theme-toggle').getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('[data-identity="proposed"]')).toHaveAttribute('data-theme', 'dark');
    expect(api).toEqual([]);
  });

  test('@mockup theme toggle sets data-theme on the wrapper and changes --color-bg', async ({
    page,
  }) => {
    const api = noApi(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(url('month-view'));
    const wrap = page.locator('[data-identity="proposed"]');
    const bg = () =>
      wrap.evaluate((e) => getComputedStyle(e).getPropertyValue('--color-bg').trim());
    const toggle = page.getByTestId('theme-toggle');
    await toggle.getByRole('radio', { name: 'Light' }).check();
    await expect(wrap).toHaveAttribute('data-theme', 'light');
    const light = await bg();
    expect(light).not.toBe('');
    await toggle.getByRole('radio', { name: 'Dark' }).check();
    await expect(wrap).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).not.toBe(light);
    expect(api).toEqual([]);
  });
});

test.describe('@mockup live simulation', () => {
  const live = (page: Page, kind: string) => page.locator(`[data-live="${kind}"]`).first();

  test('@mockup live on: rate arrives, weather refreshes, spend marker moves', async ({ page }) => {
    const api = noApi(page);
    await page.goto(url('month-view', ''));
    const rate = await live(page, 'rate').innerText();
    await expect(live(page, 'rate')).not.toHaveText(rate, { timeout: 30_000 });

    await page.goto(url('widgets', ''));
    const weather = await live(page, 'weather').innerText();
    const pace = await live(page, 'pace').innerText();
    await expect(live(page, 'weather')).not.toHaveText(weather, { timeout: 30_000 });
    await expect(live(page, 'pace')).not.toHaveText(pace, { timeout: 30_000 });
    expect(api).toEqual([]);
  });

  test('@mockup live=off: nothing changes', async ({ page }) => {
    await page.goto(url('month-view'));
    const rate = await live(page, 'rate').innerText();
    await page.waitForTimeout(5_000); // a negative can't be polled
    await expect(live(page, 'rate')).toHaveText(rate);
    await page.goto(url('widgets'));
    const weather = await live(page, 'weather').innerText();
    const pace = await live(page, 'pace').innerText();
    await page.waitForTimeout(5_000);
    await expect(live(page, 'weather')).toHaveText(weather);
    await expect(live(page, 'pace')).toHaveText(pace);
  });
});

// "0.2s, 150ms" -> [200, 150]
const toMs = (list: string) =>
  list.split(',').map((v) => {
    const t = v.trim();
    return t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000;
  });

interface Timing {
  el: string;
  ms: number[];
  delay: number[];
  iter: string[];
  skeleton: boolean;
}

async function timings(page: Page): Promise<Timing[]> {
  const raw = await page.evaluate(() => {
    const out: {
      el: string;
      ms: string[];
      delay: string[];
      iter: string;
      skeleton: boolean;
    }[] = [];
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        out.push({
          el: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''}${pseudo ?? ''} [${cs.transitionProperty} / ${cs.animationName}]`,
          ms: [cs.transitionDuration, cs.animationDuration],
          delay: [cs.transitionDelay, cs.animationDelay],
          iter: cs.animationIterationCount,
          skeleton: !!el.closest('[data-skeleton], [class*="skeleton"]'),
        });
      }
    }
    return out;
  });
  return raw.map((t) => ({
    el: t.el,
    ms: t.ms.flatMap(toMs),
    delay: t.delay.flatMap(toMs),
    iter: t.iter.split(',').map((x) => x.trim()),
    skeleton: t.skeleton,
  }));
}

test.describe('@mockup motion', () => {
  for (const route of proposed) {
    test(`@mockup reduced motion: no durations on ${route}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(url(route));
      await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
      const bad = (await timings(page)).filter((t) => t.ms.some((d) => d > 0));
      expect(bad.map((t) => `${t.el} ${t.ms}`)).toEqual([]);
    });

    test(`@mockup motion ceiling on ${route}`, async ({ page }) => {
      await page.goto(url(route));
      await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
      const all = await timings(page);
      // The skeleton pulse is the one allowed loop (DESIGN.md §Motion), so its cycle is exempt.
      const tooLong = all.filter(
        (t) => !t.skeleton && (t.ms.some((d) => d > 280) || t.delay.some((d) => d > 200)),
      );
      expect(tooLong.map((t) => `${t.el} ${t.ms} delay ${t.delay}`)).toEqual([]);
      const infinite = all.filter((t) => t.iter.includes('infinite') && !t.skeleton);
      expect(infinite.map((t) => t.el)).toEqual([]);
    });
  }
});

test.describe('@mockup fluid', () => {
  for (const route of proposed) {
    // Display belongs to the departure tile only (DESIGN.md §Typography), so only the month view
    // and the add-expense sheet (month view as backdrop) have one; every route has the gutter.
    const hasDisplay = route === 'month-view' || route === 'add-expense';
    test(`@mockup display size and gutter on ${route}`, async ({ page }) => {
      const px = (sel: string, prop: string) =>
        page
          .locator(sel)
          .first()
          .evaluate((e, p) => parseFloat(getComputedStyle(e).getPropertyValue(p)), prop);
      const at = async (w: number) => {
        await page.setViewportSize({ width: w, height: 800 });
        await page.goto(url(route));
        await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
        return {
          d: hasDisplay ? await px('.mk-display', 'font-size') : 0,
          g: await px('.mk-main', 'padding-inline-start'),
        };
      };
      const z = (n: number) => (hasDisplay ? n : 0);
      expect(await at(360)).toEqual({ d: z(32), g: 16 });
      const m = await at(820);
      if (hasDisplay) {
        expect(m.d).toBeGreaterThan(32);
        expect(m.d).toBeLessThan(40);
      } else {
        await expect(page.locator('.mk-display')).toHaveCount(0);
      }
      expect(m.g).toBe(32);
      expect(await at(1280)).toEqual({ d: z(40), g: 32 });
    });

    test(`@mockup no horizontal overflow on ${route}`, async ({ page }) => {
      for (const w of [360, 500, 768, 900, 1024, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.goto(url(route));
        await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(over, `width ${w}`).toBeLessThanOrEqual(0);
      }
    });
  }

  // Container query probe: the weather widget body's grid-template-columns is expected to change
  // (e.g. one column -> two) between a narrow and a wide container at the same viewport.
  test('@mockup widget body reacts to its container, not the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url('widgets'));
    const strip = page.locator('[data-mockup-panel="strip"]');
    await expect(strip).toBeVisible();
    const cols = async (w: number) => {
      await strip.evaluate((e, width) => {
        (e as HTMLElement).style.width = `${width}px`;
        (e as HTMLElement).style.maxWidth = 'none';
      }, w);
      return page
        .locator('[data-widget="weather"] [data-widget-body]')
        .evaluate((e) => getComputedStyle(e).gridTemplateColumns);
    };
    const narrow = await cols(280);
    const wide = await cols(1000);
    expect(narrow).not.toBe(wide);
  });
});
