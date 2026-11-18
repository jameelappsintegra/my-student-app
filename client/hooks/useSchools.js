import useApi from "./useApi";
import { api } from "../services/api";

// All schools (there are few), for selects and filters.
export default function useSchools() {
  const { data, loading, error, reload } = useApi(() => api.schools.list({ limit: 100 }), []);
  return { schools: data || [], loading, error, reload };
}
