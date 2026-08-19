import { api } from "./client";
import type { GraphResponse } from "../types";

export function fetchGraph() {
  return api.get<GraphResponse>("/api/graph");
}
