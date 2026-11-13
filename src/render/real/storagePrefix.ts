/**
 * The realistic test (`?art=real`) shares its website address with the real game, so it must never read, write or
 * clear the game's saved data. After `installStoragePrefix`, every key gets the prefix, `key`/`length` see only
 * prefixed keys, and `clear()` removes only those. Approach of the stage 0b prototype (commit 5b09d2c): the
 * methods are replaced on the storage's prototype (setting own properties on a real `Storage` would store items),
 * and the original `length` getter is kept so the new one does not call itself.
 */
const INSTALLED = Symbol.for('tc.storagePrefix');

export function installStoragePrefix(storage: Storage, prefix: 'tcreal:'): void {
  const proto = Object.getPrototypeOf(storage) as Storage & { [INSTALLED]?: string };
  if (proto[INSTALLED]) return;
  const get = proto.getItem;
  const set = proto.setItem;
  const del = proto.removeItem;
  const keyAt = proto.key;
  const rawLength = Object.getOwnPropertyDescriptor(proto, 'length')?.get as (this: Storage) => number;
  const own = (s: Storage): string[] => {
    const out: string[] = [];
    const n = rawLength.call(s);
    for (let i = 0; i < n; i++) {
      const k = keyAt.call(s, i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
    return out;
  };
  proto.getItem = function (this: Storage, k: string) {
    return get.call(this, prefix + k);
  };
  proto.setItem = function (this: Storage, k: string, v: string) {
    set.call(this, prefix + k, v);
  };
  proto.removeItem = function (this: Storage, k: string) {
    del.call(this, prefix + k);
  };
  proto.clear = function (this: Storage) {
    for (const k of own(this)) del.call(this, k);
  };
  proto.key = function (this: Storage, i: number) {
    const k = own(this)[i];
    return k ? k.slice(prefix.length) : null;
  };
  Object.defineProperty(proto, 'length', {
    configurable: true,
    get(this: Storage) {
      return own(this).length;
    },
  });
  Object.defineProperty(proto, INSTALLED, { value: prefix });
}
