import { useCallback, useEffect, useState } from "react";

// Runs `fetcher` whenever `deps` change and tracks loading/error state.
export default function useApi(fetcher, deps = []) {
  const [state, setState] = useState({
    data: null,
    pagination: null,
    loading: true,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    run()
      .then((res) => {
        if (!cancelled) {
          setState({
            data: res.data,
            pagination: res.pagination || null,
            loading: false,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error }));
      });
    return () => {
      cancelled = true;
    };
  }, [run, reloadKey]);

  return { ...state, reload: () => setReloadKey((k) => k + 1) };
}
