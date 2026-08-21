import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_CONFIG, STORAGE_KEYS } from '@/lib/utils/constants';
import { createAuthHeaders } from '@/lib/utils/school';

export interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
  network?: boolean;
  data?: any;
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — auth token + tenant context (mirrors elite-cbt)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const headers = createAuthHeaders();
    if (!config.headers) config.headers = {} as any;
    if (headers.authorization) config.headers.Authorization = headers.authorization;
    if (headers['x-school-id']) config.headers['X-School-Id'] = headers['x-school-id'];
    if (headers['x-branch-id']) config.headers['X-Branch-Id'] = headers['x-branch-id'];
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor — 401 → clear token → login; network → friendly message
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
      localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
      window.location.href = '/login';
    }

    if (!error.response) {
      const friendly =
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'You appear to be offline. Check your connection and try again.'
          : 'Cannot reach the server. Please check your connection and try again.';
      const apiError: ApiError = { message: friendly, status: 0, network: true };
      return Promise.reject(apiError);
    }

    const data: Record<string, any> = error.response?.data || {};
    const fieldErrors: Record<string, string> = {};
    if (data.errors && typeof data.errors === 'object') {
      Object.entries(data.errors).forEach(([k, v]) => {
        fieldErrors[k] = Array.isArray(v) ? v[0] : String(v);
      });
    }
    const apiError: ApiError = {
      message: data.message || data.error || Object.values(fieldErrors)[0] || 'An error occurred',
      status: error.response?.status || 500,
      errors: (Object.keys(fieldErrors).length ? fieldErrors : undefined) as Record<string, string[]> | undefined,
      data,
    };
    return Promise.reject(apiError);
  }
);

export default apiClient;
