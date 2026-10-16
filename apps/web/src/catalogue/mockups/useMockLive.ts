/** Simulated "live" values for the mock-ups (DESIGN.md §Motion). Pure timers over fixtures: no API,
 * no store. `?live=off` schedules nothing; anything else is on. `?state=rate-arrives` (the older
 * MonthViewMock switch) is covered because live is on by default.
 *
 * Each value carries `changed`, a counter that is 0 on first render and +1 per update. A view adds
 * `mk-flip` while `changed > 0` and keys the element on it, so the flip plays once per update and
 * never on first render. */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { useRoute } from 'vue-router';

export const RATE_MS = 1200;
export const WEATHER_MS = 8000;
export const PACE_MS = 3000;
const TEMPS = [14, 15, 15, 16, 15, 14];

export interface LiveValue<T> {
  value: Ref<T>;
  changed: Ref<number>;
}
const live$ = <T>(initial: T): LiveValue<T> => ({ value: ref(initial) as Ref<T>, changed: ref(0) });

export function useMockLive(opts: { monthDays?: number; startDay?: number } = {}) {
  const { monthDays = 30, startDay = 14 } = opts;
  const route = useRoute();
  const live = computed(() => route.query['live'] !== 'off');

  const rate = { ...live$(false), arrived: ref(false) };
  const weather = live$(TEMPS[0]!);
  const pace = live$(startDay);

  const timers: ReturnType<typeof setTimeout>[] = [];
  onMounted(() => {
    if (!live.value) return;
    timers.push(
      setTimeout(() => {
        rate.arrived.value = true;
        rate.value.value = true;
        rate.changed.value++;
      }, RATE_MS),
    );
    let tick = 0;
    timers.push(
      setInterval(() => {
        weather.value.value = TEMPS[++tick % TEMPS.length]!;
        weather.changed.value++;
      }, WEATHER_MS),
    );
    const paceTimer = setInterval(() => {
      if (pace.value.value >= monthDays) return clearInterval(paceTimer);
      pace.value.value++;
      pace.changed.value++;
    }, PACE_MS);
    timers.push(paceTimer);
  });
  onBeforeUnmount(() => {
    // clearTimeout and clearInterval share one id pool
    timers.forEach((t) => clearTimeout(t));
    timers.length = 0;
  });

  return { live, rate, weather, pace };
}
