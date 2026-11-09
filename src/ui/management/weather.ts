/** Weather HUD text and icons (Phase 3 §4.9, §7.1; Phase 4 §4.7 night). Owner: W2-B. Pure. */
import type { WeatherKey } from '../../data/catalog/types';
import { text } from '../../data/strings/en';
import { isNight } from '../../sim/lighting/api';
import type { GameState } from '../../sim/types';
import type { MgmtIconName } from './icons';

export function weatherName(w: WeatherKey): string {
  return text(`weather.${w}`);
}

/** "Rain now · Cloudy next". */
export function forecastText(weather: { current: WeatherKey; next: WeatherKey }): string {
  return text('weather.forecast', { now: weatherName(weather.current), next: weatherName(weather.next) });
}

/** The icon of a weather state; at `night` a clear sky shows the moon instead of the sun. */
export function weatherIcon(w: WeatherKey, night = false): MgmtIconName {
  if (night && w === 'sunny') return 'weather_night';
  return `weather_${w}` as MgmtIconName;
}

/**
 * The HUD's two weather icons. With After Dark on, night is the simulation window 20:00–06:00 (`isNight`, Phase 4
 * §4.7): the current icon follows the clock, the forecast icon the tick its state starts (`nextChangeTick`). With
 * After Dark off there is no night (darkness stays 0), so the day icons show.
 */
export function hudWeatherIcons(state: Pick<GameState, 'tick' | 'park' | 'management'>): { now: MgmtIconName; next: MgmtIconName; night: boolean } {
  const w = state.management.weather;
  const dark = state.park.afterDark;
  const night = dark && isNight(state.tick);
  return { now: weatherIcon(w.current, night), next: weatherIcon(w.next, dark && isNight(w.nextChangeTick)), night };
}
