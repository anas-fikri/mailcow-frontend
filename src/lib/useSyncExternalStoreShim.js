/**
 * Shim useSyncExternalStoreWithSelector di atas REACT UTAMA aplikasi.
 *
 * Latar belakang (React error #310): zustand@4 → 'use-sync-external-store/
 * shim/with-selector.js' (CJS) melakukan require("react") yang pada pipeline
 * rolldown-vite menghasilkan MODULE INSTANCE REACT KE-DUA (interop ESM vs
 * CJS) dan ter-bundle sebagai salinan react/cjs/*.production di dalam chunk
 * api. Akibatnya hook store bisa jalan lewat dispatcher copy lain →
 * "Minified React error #310 — Rendered fewer hooks than expected".
 *
 * Fix: vite.config meng-alias seluruh subpath 'use-sync-external-store'
 * ke file ini sehingga satu-satunya consumer CJS-react hilang dari graph
 * dan hanya tersisa SATU salinan React di bundle.
 *
 * Implementasi: port setia algoritma upstream v1.6.0 (selector memoization +
 * isEqual) menggunakan hooks dari 'react' instance utama aplikasi.
 */

import { useMemo, useRef } from 'react';
import { useSyncExternalStore } from 'react';

function is(x, y) {
  return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
}

const objectIs = typeof Object.is === 'function' ? Object.is : is;

export function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual = objectIs,
) {
  // SSR tak dipakai (SPA murni) — client snapshot selalu dipakai.
  void getServerSnapshot;

  // Memo "inst" ala upstream agar identitas antar render stabil.
  const instRef = useRef(undefined);
  let inst;
  if (instRef.current === undefined) {
    inst = { hasValue: false, value: null };
    instRef.current = inst;
  } else {
    inst = instRef.current;
  }

  const getSelection = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;
    let memoizedSelector = selector;

    return function selectorWrapper(nextSnapshot) {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSelection = selector(nextSnapshot);
        memoizedSnapshot = nextSnapshot;
        memoizedSelector = selector;
        inst.value = memoizedSelection;
        inst.hasValue = true;
        return memoizedSelection;
      }
      if (
        !objectIs(memoizedSnapshot, nextSnapshot) ||
        !isEqual(memoizedSelector, selector)
      ) {
        const nextSelection = selector(nextSnapshot);
        // Upstream mempertahankan selection lama bila isEqual — mencegah tear.
        if (!isEqual(memoizedSelection, nextSelection)) {
          memoizedSelection = nextSelection;
          inst.value = memoizedSelection;
        }
        memoizedSnapshot = nextSnapshot;
        memoizedSelector = selector;
        hasMemo = true;
        return memoizedSelection;
      }
      return memoizedSelection;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, getSnapshot, selector, isEqual]);

  return useSyncExternalStore(
    subscribe,
    () => getSelection(getSnapshot()),
    () => getSelection(getServerSnapshot?.() ?? getSnapshot()),
  );
}

export { is as objectIsEqual };
// Bentuk sesuai package asli:
//   - named export  : useSyncExternalStoreWithSelector (zustand/traditional)
//   - DEFAULT export: OBJECT { useSyncExternalStoreWithSelector }
//     karena zustand/esm/index.mjs melakukan:
//       import X from 'use-sync-external-store/shim/with-selector.js'
//       const { useSyncExternalStoreWithSelector } = X;
const useSyncExternalStoreExports = { useSyncExternalStoreWithSelector };
export default useSyncExternalStoreExports;
