import { useCallback, useState } from "react";
import { fetchGraph } from "../api/graph";
import { ApiRequestError } from "../api/client";
import type { GraphResponse } from "../types";

export function useGraph() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGraph();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not reach the server.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refresh };
}
