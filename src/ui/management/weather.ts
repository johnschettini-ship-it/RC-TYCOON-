/** Weather HUD text and icons (Phase 3 §4.9, §7.1). Owner: W2-B. Pure. */
import type { WeatherKey } from '../../data/catalog/types';
import { text } from '../../data/strings/en';
import type { MgmtIconName } from './icons';

export function weatherName(w: WeatherKey): string {
  return text(`weather.${w}`);
}

/** "Rain now · Cloudy next". */
export function forecastText(weather: { current: WeatherKey; next: WeatherKey }): string {
  return text('weather.forecast', { now: weatherName(weather.current), next: weatherName(weather.next) });
}

export function weatherIcon(w: WeatherKey): MgmtIconName {
  return `weather_${w}` as MgmtIconName;
}
